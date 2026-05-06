// Floyd Feeder v2.2 — BLE primary + SoftAP/MQTT fallback (NimBLE)
#include <WiFi.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <sMQTTBroker.h>
#include <NimBLEDevice.h>
#include <cstring>
#include <time.h>
#include <sys/time.h>

#define BLE_UUID_SERVICE      "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_UUID_COMMAND      "4fafc201-1fb5-459e-8fcc-c5c9c3319141"
#define BLE_UUID_RESPONSE     "4fafc201-1fb5-459e-8fcc-c5c9c3319142"
#define BLE_UUID_TELEMETRY    "4fafc201-1fb5-459e-8fcc-c5c9c3319143"
#define BLE_UUID_STATUS       "4fafc201-1fb5-459e-8fcc-c5c9c3319144"
#define BLE_UUID_SCHEDULES    "4fafc201-1fb5-459e-8fcc-c5c9c3319145"
#define BLE_UUID_CONFIG       "4fafc201-1fb5-459e-8fcc-c5c9c3319146"
#define BLE_UUID_TIME         "4fafc201-1fb5-459e-8fcc-c5c9c3319147"
#define BLE_UUID_FEEDLOG      "4fafc201-1fb5-459e-8fcc-c5c9c3319148"

#define PREFS_NAMESPACE   "floyd-cfg"
#define PREFS_KEY_CFG     "cfg"
#define PREFS_KEY_SCHEDULES "sched"
#define PREFS_KEY_APMODE  "apmode"

#define TIME_SYNC_MIN_EPOCH 1577836800UL

struct AppConfig {
  float cylinderRadius        = 10.0f;
  float cylinderHeight        = 25.4f;
  float frustumTopRadius      = 10.0f;
  float frustumBottomRadius   = 5.0f;
  float frustumHeight         = 15.0f;
  unsigned long sensorInterval = 5000;
};

AppConfig cfg;
Preferences prefs;

#define MAX_SCHEDULES 10

struct FeedSchedule {
  char id[13];
  char label[33];
  char time[6];
  char daysOfWeek[14];
  int augerSpeed;
  int impellerSpeed;
  unsigned long preSpinMs;
  unsigned long feedMs;
  unsigned long postSpinMs;
  bool enabled;
  unsigned long lastFired;
};

struct ScheduleStore {
  uint8_t count;
  FeedSchedule schedules[MAX_SCHEDULES];
};

ScheduleStore scheduleStore;

String deviceChipId = String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);
String mqttClientId = "floyd-" + deviceChipId;
String topicCommand;
String topicTelemetry;
String topicStatus;
String topicResponse;

String pendingCommandPayload;
String pendingResponse;
volatile bool pendingCommand = false;

bool apModeRuntime = false;
unsigned long lastMqttRx = 0;

NimBLECharacteristic *bleRspChar = nullptr;
NimBLECharacteristic *bleTelChar = nullptr;
NimBLECharacteristic *bleStaChar = nullptr;
NimBLECharacteristic *bleFeedlogChar = nullptr;

static uint8_t schChunkBuf[4096];
static size_t schChunkLen = 0;
static uint16_t schChunkExpectTotal = 0;

class FloydBroker : public sMQTTBroker {
public:
  bool onEvent(sMQTTEvent *event) override {
    if (event->Type() == Public_sMQTTEventType) {
      auto *e = static_cast<sMQTTPublicClientEvent *>(event);
      String topic(e->Topic().c_str());
      if (topic == topicCommand) {
        lastMqttRx = millis();
        pendingCommandPayload = String(e->Payload().c_str());
        pendingCommand = true;
      }
    }
    return true;
  }
};

FloydBroker broker;

#define MOTOR_A_ENA    14
#define MOTOR_A_IN1    12
#define MOTOR_A_IN2    13
#define MOTOR_B_ENB    0
#define MOTOR_B_IN3    15
#define MOTOR_B_IN4    16

#define LEDC_CH_AUGER     0
#define LEDC_CH_IMPELLER  1
#define LEDC_FREQ         25000
#define LEDC_RESOLUTION   10

#define DEFAULT_PRE_SPIN_MS      1500
#define DEFAULT_POST_SPIN_MS     1500
#define DEFAULT_FEED_MS          3000
#define MIN_FEED_MS              500
#define MAX_FEED_MS              30000
#define DEFAULT_JAM_CLEAR_MS     2000
#define DEFAULT_AUGER_SPEED      768
#define DEFAULT_IMPELLER_SPEED   1023

float totalVolumeCm3 = 0;

unsigned long lastSensorRead = 0;
#define MIN_SENSOR_INTERVAL      1000
#define MAX_SENSOR_INTERVAL      60000

enum MotorState {
  STATE_IDLE,
  STATE_PRE_SPIN,
  STATE_FEEDING,
  STATE_POST_SPIN,
  STATE_JAM_CLEAR,
  STATE_STOPPING
};

struct MotorControl {
  MotorState   state          = STATE_IDLE;
  unsigned long stateStartTime = 0;
  unsigned long preSpinMs      = DEFAULT_PRE_SPIN_MS;
  unsigned long feedMs         = DEFAULT_FEED_MS;
  unsigned long postSpinMs     = DEFAULT_POST_SPIN_MS;
  unsigned long jamClearMs     = DEFAULT_JAM_CLEAR_MS;
  int           augerSpeed     = DEFAULT_AUGER_SPEED;
  int           impellerSpeed  = DEFAULT_IMPELLER_SPEED;
} motor;

struct SensorData {
  float foodLevelPercentage = 0;
} sensors;

void broadcastResponse(JsonDocument &doc);
void sendDeviceStatus(uint8_t num);
void flushPendingResponseTransport();
void notifyBle(NimBLECharacteristic *ch, const String &json);
bool buildDeviceStatusJson(JsonDocument &doc);
const char *motorStateLabel(MotorState st);
void startFeeding(int augerSpeed, int impellerSpeed, unsigned long preSpinMs, unsigned long feedMs, unsigned long postSpinMs);
void stopAllMotors();

bool isTimeSynced() {
  time_t t = time(nullptr);
  return (unsigned long)t >= TIME_SYNC_MIN_EPOCH;
}

void loadConfig() {
  prefs.begin(PREFS_NAMESPACE, false);
  size_t len = prefs.getBytesLength(PREFS_KEY_CFG);
  if (len == sizeof(AppConfig)) {
    prefs.getBytes(PREFS_KEY_CFG, &cfg, sizeof(AppConfig));
    Serial.println("Loaded config from NVS");
  } else {
    Serial.println("No valid config in NVS, using defaults");
  }
  prefs.end();
}

void saveConfig() {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putBytes(PREFS_KEY_CFG, &cfg, sizeof(AppConfig));
  prefs.end();
  Serial.println("Saved config to NVS");
}

void loadSchedules() {
  prefs.begin(PREFS_NAMESPACE, false);
  size_t len = prefs.getBytesLength(PREFS_KEY_SCHEDULES);
  if (len == sizeof(ScheduleStore)) {
    prefs.getBytes(PREFS_KEY_SCHEDULES, &scheduleStore, sizeof(ScheduleStore));
    Serial.printf("Loaded %d schedules from NVS\n", scheduleStore.count);
  } else {
    scheduleStore.count = 0;
    Serial.println("No valid schedules in NVS");
  }
  prefs.end();
}

void saveSchedules() {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putBytes(PREFS_KEY_SCHEDULES, &scheduleStore, sizeof(ScheduleStore));
  prefs.end();
  Serial.printf("Saved %d schedules to NVS\n", scheduleStore.count);
}

void checkSchedules() {
  if (!isTimeSynced()) return;

  time_t nowSec = time(nullptr);
  struct tm tmLocal;
  localtime_r(&nowSec, &tmLocal);

  char nowTime[6];
  snprintf(nowTime, sizeof(nowTime), "%02d:%02d", tmLocal.tm_hour, tmLocal.tm_min);
  int nowDow = tmLocal.tm_wday;

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    FeedSchedule &sch = scheduleStore.schedules[i];
    if (!sch.enabled) continue;

    if (strcmp(sch.time, nowTime) != 0) continue;

    String days = String(sch.daysOfWeek);
    if (days.indexOf(String(nowDow)) < 0) continue;

    if (sch.lastFired != 0) {
      unsigned long nowMillis = millis();
      if (nowMillis - sch.lastFired < 59000) continue;
    }

    sch.lastFired = millis();
    startFeeding(sch.augerSpeed, sch.impellerSpeed, sch.preSpinMs, sch.feedMs, sch.postSpinMs);

    Serial.printf("Scheduled feed: %s at %s\n", sch.label, nowTime);
  }
}

unsigned long elapsedSince(unsigned long since) {
  unsigned long now = millis();
  return (now >= since) ? (now - since) : (0xFFFFFFFF - since) + now + 1;
}

void initMotorPins() {
  ledcAttach(MOTOR_A_ENA, LEDC_FREQ, LEDC_RESOLUTION);
  ledcAttach(MOTOR_B_ENB, LEDC_FREQ, LEDC_RESOLUTION);

  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);

  // IMPORTANT: GPIO0 is both ENB (impeller PWM) and a boot-strap pin.
  // The pinMode / ledcAttach in setup pulls it HIGH internally,
  // which is safe. Do NOT add an external pull-down to GPIO0.
  stopAllMotors();
}

void setupMQTTTopics() {
  topicCommand   = "floyd/devices/" + deviceChipId + "/command";
  topicTelemetry = "floyd/devices/" + deviceChipId + "/telemetry";
  topicStatus    = "floyd/devices/" + deviceChipId + "/status";
  topicResponse  = "floyd/devices/" + deviceChipId + "/response";
}

void applyScheduleArray(JsonArray arr) {
  scheduleStore.count = min((uint8_t)arr.size(), (uint8_t)MAX_SCHEDULES);

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    JsonObject obj = arr[i];
    FeedSchedule &sch = scheduleStore.schedules[i];
    strncpy(sch.id, obj["id"] | "", 12);
    sch.id[12] = '\0';
    strncpy(sch.label, obj["label"] | "Feed", 32);
    sch.label[32] = '\0';
    strncpy(sch.time, obj["time"] | "08:00", 5);
    sch.time[5] = '\0';
    strncpy(sch.daysOfWeek, obj["daysOfWeek"] | "0,1,2,3,4,5,6", 13);
    sch.daysOfWeek[13] = '\0';
    sch.augerSpeed = obj["augerSpeed"] | 768;
    sch.impellerSpeed = obj["impellerSpeed"] | 1023;
    sch.preSpinMs = obj["preSpinMs"] | 1500;
    sch.feedMs = obj["feedMs"] | 3000;
    sch.postSpinMs = obj["postSpinMs"] | 1500;
    sch.enabled = obj["enabled"] | true;
    sch.lastFired = 0;
  }

  saveSchedules();
}

void setAugerMotor(int speed, bool forward) {
  speed = constrain(speed, 0, 1023);

  if (speed == 0) {
    digitalWrite(MOTOR_A_IN1, LOW);
    digitalWrite(MOTOR_A_IN2, LOW);
    ledcWrite(MOTOR_A_ENA, 0);
  } else {
    ledcWrite(MOTOR_A_ENA, speed);
    digitalWrite(MOTOR_A_IN1, forward ? HIGH : LOW);
    digitalWrite(MOTOR_A_IN2, forward ? LOW : HIGH);
  }
}

void setImpellerMotor(int speed) {
  speed = constrain(speed, 0, 1023);

  if (speed == 0) {
    digitalWrite(MOTOR_B_IN3, LOW);
    digitalWrite(MOTOR_B_IN4, LOW);
    ledcWrite(MOTOR_B_ENB, 0);
  } else {
    ledcWrite(MOTOR_B_ENB, speed);
    digitalWrite(MOTOR_B_IN3, HIGH);
    digitalWrite(MOTOR_B_IN4, LOW);
  }
}

void stopAllMotors() {
  ledcWrite(MOTOR_A_ENA, 0);
  ledcWrite(MOTOR_B_ENB, 0);
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
}

const char *motorStateLabel(MotorState st) {
  switch (st) {
    case STATE_IDLE:       return "idle";
    case STATE_PRE_SPIN:   return "pre_spin";
    case STATE_FEEDING:    return "feeding";
    case STATE_POST_SPIN:  return "post_spin";
    case STATE_JAM_CLEAR:  return "jam_clear";
    default:               return "idle";
  }
}

void sendFeedingComplete();
void sendJamClearComplete();

void updateMotorState() {
  MotorControl &mc = motor;
  unsigned long elapsed = elapsedSince(mc.stateStartTime);

  switch (mc.state) {
    case STATE_IDLE:
      break;

    case STATE_PRE_SPIN:
      if (elapsed >= mc.preSpinMs) {
        setAugerMotor(mc.augerSpeed, true);
        mc.state = STATE_FEEDING;
        mc.stateStartTime = millis();
      }
      break;

    case STATE_FEEDING:
      if (elapsed >= mc.feedMs) {
        setAugerMotor(0, true);
        mc.state = STATE_POST_SPIN;
        mc.stateStartTime = millis();
      }
      break;

    case STATE_POST_SPIN:
      if (elapsed >= mc.postSpinMs) {
        setImpellerMotor(0);
        mc.state = STATE_IDLE;
        mc.stateStartTime = 0;
        sendFeedingComplete();
      }
      break;

    case STATE_JAM_CLEAR:
      if (elapsed >= mc.jamClearMs) {
        stopAllMotors();
        mc.state = STATE_IDLE;
        mc.stateStartTime = 0;
        sendJamClearComplete();
      }
      break;

    case STATE_STOPPING:
      stopAllMotors();
      mc.state = STATE_IDLE;
      mc.stateStartTime = 0;
      break;
  }
}

void startFeeding(int augerSpeed, int impellerSpeed,
                  unsigned long preSpinMs, unsigned long feedMs, unsigned long postSpinMs) {
  preSpinMs     = constrain(preSpinMs, 500, 5000);
  feedMs        = constrain(feedMs, MIN_FEED_MS, MAX_FEED_MS);
  postSpinMs    = constrain(postSpinMs, 500, 5000);
  augerSpeed    = constrain(augerSpeed, 0, 1023);
  impellerSpeed = constrain(impellerSpeed, 0, 1023);

  motor.preSpinMs     = preSpinMs;
  motor.feedMs        = feedMs;
  motor.postSpinMs    = postSpinMs;
  motor.augerSpeed    = augerSpeed;
  motor.impellerSpeed = impellerSpeed;

  setImpellerMotor(impellerSpeed);
  setAugerMotor(0, true);

  motor.state          = STATE_PRE_SPIN;
  motor.stateStartTime = millis();
}

void startJamClear(int speed, unsigned long duration) {
  speed    = constrain(speed, 0, 1023);
  duration = constrain(duration, 500, 5000);

  motor.jamClearMs = duration;

  setImpellerMotor(0);
  setAugerMotor(speed, false);

  motor.state          = STATE_JAM_CLEAR;
  motor.stateStartTime = millis();
}

void emergencyStop() {
  motor.state          = STATE_STOPPING;
  motor.stateStartTime = millis();
}

float frustumVolume(float h, float R, float r) {
  return (PI / 3.0f) * h * (R * R + R * r + r * r);
}

float cylinderVolume(float h, float r) {
  return PI * r * r * h;
}

float computeTotalVolume() {
  return frustumVolume(cfg.frustumHeight, cfg.frustumTopRadius, cfg.frustumBottomRadius)
       + cylinderVolume(cfg.cylinderHeight, cfg.cylinderRadius);
}

float computeCurrentVolume(float distanceCm) {
  float transitionCm = cfg.cylinderHeight;
  float vFrustumFull = frustumVolume(cfg.frustumHeight, cfg.frustumTopRadius, cfg.frustumBottomRadius);

  if (distanceCm <= transitionCm) {
    float cylinderFilledHeight = transitionCm - distanceCm;
    return cylinderVolume(cylinderFilledHeight, cfg.cylinderRadius) + vFrustumFull;
  } else {
    float frustumFilledHeight = distanceCm - transitionCm;
    if (frustumFilledHeight > cfg.frustumHeight)
      frustumFilledHeight = cfg.frustumHeight;

    float rAtLevel = cfg.frustumTopRadius
                   - (frustumFilledHeight / cfg.frustumHeight)
                   * (cfg.frustumTopRadius - cfg.frustumBottomRadius);

    return frustumVolume(frustumFilledHeight, cfg.frustumTopRadius, rAtLevel);
  }
}

float calculateFoodLevel(float distanceCm) {
  if (totalVolumeCm3 <= 0) return 0;
  float pct = (computeCurrentVolume(distanceCm) / totalVolumeCm3) * 100.0f;
  return constrain(pct, 0, 100);
}

SensorData readSensors() {
  yield();

  sensors.foodLevelPercentage = 0;

  Serial.println("--- Device Status ---");
  Serial.println("Food: 0% (sensors not available)");
  Serial.println("Motor: " + String(motorStateLabel(motor.state)));
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("----------------------");

  return sensors;
}

void notifyBle(NimBLECharacteristic *ch, const String &json) {
  if (!ch || apModeRuntime || json.length() == 0) return;
  ch->setValue(json.c_str());
  ch->notify();
}

void flushPendingResponseTransport() {
  if (pendingResponse.length() == 0) return;
  if (apModeRuntime) {
    broker.publish(topicResponse.c_str(), pendingResponse.c_str());
  } else if (bleRspChar) {
    notifyBle(bleRspChar, pendingResponse);
  }
  pendingResponse = "";
}

void broadcastResponse(JsonDocument &doc) {
  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

void fillMotorData(JsonObject &data) {
  data["motorState"]    = motorStateLabel(motor.state);
  data["augerSpeed"]    = motor.augerSpeed;
  data["impellerSpeed"] = motor.impellerSpeed;
}

void fillSensorData(JsonObject &data) {
  data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10.0f) / 10.0f;
}

bool buildDeviceStatusJson(JsonDocument &doc) {
  doc["type"] = "status";
  JsonObject data = doc.createNestedObject("data");
  data["connected"]   = true;
  data["uptime"]      = millis();
  data["freeHeap"]    = ESP.getFreeHeap();
  data["wifiRssi"]    = apModeRuntime ? WiFi.RSSI() : 0;
  data["sensorInterval"] = cfg.sensorInterval;
  data["motorState"]  = motorStateLabel(motor.state);
  data["timeSynced"]  = isTimeSynced();
  data["apMode"]      = apModeRuntime;

  JsonObject fcfg = data.createNestedObject("feederConfig");
  fcfg["cylinderRadius"]      = cfg.cylinderRadius;
  fcfg["cylinderHeight"]      = cfg.cylinderHeight;
  fcfg["frustumTopRadius"]    = cfg.frustumTopRadius;
  fcfg["frustumBottomRadius"] = cfg.frustumBottomRadius;
  fcfg["frustumHeight"]       = cfg.frustumHeight;
  fcfg["totalVolumeCm3"]      = totalVolumeCm3;
  fcfg["sensorInterval"]      = cfg.sensorInterval;
  fcfg["defaultPreSpinMs"]    = DEFAULT_PRE_SPIN_MS;
  fcfg["defaultPostSpinMs"]   = DEFAULT_POST_SPIN_MS;
  fcfg["defaultFeedMs"]       = DEFAULT_FEED_MS;

  fillSensorData(data);
  doc["timestamp"] = millis();
  return true;
}

void broadcastSensorData() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");
  fillSensorData(data);
  fillMotorData(data);
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  if (apModeRuntime) {
    broker.publish(topicTelemetry.c_str(), output.c_str());
  } else if (bleTelChar) {
    notifyBle(bleTelChar, output);
  }
}

void sendSensorData(uint8_t num) {
  (void)num;
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");
  fillSensorData(data);
  fillMotorData(data);
  doc["timestamp"] = millis();
  broadcastResponse(doc);
}

void sendDeviceStatus(uint8_t num) {
  (void)num;
  StaticJsonDocument<768> doc;
  buildDeviceStatusJson(doc);

  String output;
  serializeJson(doc, output);

  if (apModeRuntime) {
    broker.publish(topicStatus.c_str(), output.c_str(), 0, true);
  } else if (bleStaChar) {
    notifyBle(bleStaChar, output);
  }
}

void sendFeedingComplete() {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  JsonObject data = doc.createNestedObject("data");
  data["action"]     = "feed_complete";
  data["success"]    = true;
  data["motorState"] = motorStateLabel(motor.state);
  doc["timestamp"]   = millis();
  broadcastResponse(doc);
  notifyBle(bleFeedlogChar, pendingResponse);
}

void sendJamClearComplete() {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  JsonObject data = doc.createNestedObject("data");
  data["action"]     = "jam_clear_complete";
  data["success"]    = true;
  data["motorState"] = motorStateLabel(motor.state);
  doc["timestamp"]   = millis();
  broadcastResponse(doc);
}

void sendError(uint8_t num, const String &errorMessage) {
  (void)num;
  StaticJsonDocument<256> doc;
  doc["type"]              = "error";
  doc["data"]["message"]   = errorMessage;
  doc["timestamp"]         = millis();
  broadcastResponse(doc);
}

void handlePing(uint8_t num) {
  (void)num;
  StaticJsonDocument<128> doc;
  doc["type"]           = "status";
  doc["data"]["pong"]   = true;
  doc["data"]["uptime"] = millis();
  doc["data"]["freeHeap"] = ESP.getFreeHeap();
  doc["timestamp"]      = millis();
  broadcastResponse(doc);
}

static void resetScheduleChunkState() {
  schChunkLen = 0;
  schChunkExpectTotal = 0;
}

static bool parseBleSchedulesPayload() {
  if (schChunkLen >= sizeof(schChunkBuf)) return false;
  schChunkBuf[schChunkLen] = '\0';

  StaticJsonDocument<4096> doc;
  DeserializationError err = deserializeJson(doc, schChunkBuf);
  if (err) return false;

  JsonArray arr;
  if (doc.is<JsonArray>()) {
    arr = doc.as<JsonArray>();
  } else if (doc.containsKey("schedules")) {
    arr = doc["schedules"].as<JsonArray>();
  } else if (doc.containsKey("parameters") && doc["parameters"]["schedules"].is<JsonArray>()) {
    arr = doc["parameters"]["schedules"].as<JsonArray>();
  } else {
    return false;
  }

  applyScheduleArray(arr);
  return true;
}

static void onBleScheduleWrite(const std::string &raw) {
  size_t len = raw.size();
  if (len < 4) return;

  const uint8_t *d = reinterpret_cast<const uint8_t *>(raw.data());
  uint16_t idx   = (uint16_t)d[0] | ((uint16_t)d[1] << 8);
  uint16_t total = (uint16_t)d[2] | ((uint16_t)d[3] << 8);
  size_t payloadLen = len - 4;

  if (total == 0 || idx >= total) {
    resetScheduleChunkState();
    return;
  }

  if (idx == 0) {
    schChunkLen = 0;
    schChunkExpectTotal = total;
  }

  if (schChunkExpectTotal != total) {
    resetScheduleChunkState();
    return;
  }

  if (schChunkLen + payloadLen > sizeof(schChunkBuf)) {
    resetScheduleChunkState();
    StaticJsonDocument<192> errDoc;
    errDoc["type"] = "error";
    errDoc["data"]["message"] = "schedule_chunk_overflow";
    errDoc["timestamp"] = millis();
    broadcastResponse(errDoc);
    return;
  }

  memcpy(schChunkBuf + schChunkLen, d + 4, payloadLen);
  schChunkLen += payloadLen;

  if (idx == total - 1) {
    bool ok = parseBleSchedulesPayload();
    resetScheduleChunkState();

    StaticJsonDocument<256> rsp;
    rsp["type"] = "control_response";
    rsp["data"]["action"] = ok ? "set_schedules" : "set_schedules_error";
    rsp["data"]["success"] = ok;
    rsp["timestamp"] = millis();
    broadcastResponse(rsp);
  }
}

static void onBleConfigWrite(const std::string &raw) {
  StaticJsonDocument<768> doc;
  DeserializationError error = deserializeJson(doc, raw.c_str());
  if (error) return;

  if (doc.containsKey("cylinderRadius"))      cfg.cylinderRadius      = doc["cylinderRadius"];
  if (doc.containsKey("cylinderHeight"))      cfg.cylinderHeight      = doc["cylinderHeight"];
  if (doc.containsKey("frustumTopRadius"))    cfg.frustumTopRadius    = doc["frustumTopRadius"];
  if (doc.containsKey("frustumBottomRadius")) cfg.frustumBottomRadius = doc["frustumBottomRadius"];
  if (doc.containsKey("frustumHeight"))       cfg.frustumHeight       = doc["frustumHeight"];
  if (doc.containsKey("sensorInterval")) {
    cfg.sensorInterval = constrain(
      doc["sensorInterval"].as<unsigned long>(),
      (unsigned long)MIN_SENSOR_INTERVAL,
      (unsigned long)MAX_SENSOR_INTERVAL
    );
  }

  totalVolumeCm3 = computeTotalVolume();
  saveConfig();

  StaticJsonDocument<256> rsp;
  rsp["type"] = "control_response";
  rsp["data"]["action"] = "set_config";
  rsp["data"]["success"] = true;
  rsp["timestamp"] = millis();
  broadcastResponse(rsp);
}

static void onBleTimeWrite(const std::string &raw) {
  if (raw.size() < 4) return;

  uint32_t unixTs = (uint32_t)(uint8_t)raw[0]
                  | ((uint32_t)(uint8_t)raw[1] << 8)
                  | ((uint32_t)(uint8_t)raw[2] << 16)
                  | ((uint32_t)(uint8_t)raw[3] << 24);

  if (unixTs < TIME_SYNC_MIN_EPOCH) return;

  struct timeval tv;
  tv.tv_sec = (time_t)unixTs;
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);
  Serial.printf("Time sync: %lu\n", (unsigned long)unixTs);
}

class FloydBLEServerCallbacks : public NimBLEServerCallbacks {
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo, int reason) override {
    (void)pServer;
    (void)connInfo;
    (void)reason;
    resetScheduleChunkState();
  }
};

class BleCommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    pendingCommandPayload = String(pCharacteristic->getValue().c_str());
    pendingCommand = true;
  }
};

class BleScheduleCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    onBleScheduleWrite(pCharacteristic->getValue());
  }

  void onRead(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    StaticJsonDocument<4096> doc;
    DeserializationError emptyOk = deserializeJson(doc, "[]");
    if (emptyOk) return;
    JsonArray arr = doc.as<JsonArray>();

    for (uint8_t i = 0; i < scheduleStore.count; i++) {
      FeedSchedule &sch = scheduleStore.schedules[i];
      JsonObject obj = arr.createNestedObject();
      obj["id"] = sch.id;
      obj["label"] = sch.label;
      obj["time"] = sch.time;
      obj["daysOfWeek"] = sch.daysOfWeek;
      obj["augerSpeed"] = sch.augerSpeed;
      obj["impellerSpeed"] = sch.impellerSpeed;
      obj["preSpinMs"] = sch.preSpinMs;
      obj["feedMs"] = sch.feedMs;
      obj["postSpinMs"] = sch.postSpinMs;
      obj["enabled"] = sch.enabled;
    }

    String out;
    serializeJson(doc, out);
    pCharacteristic->setValue(out.c_str());
  }
};

class BleConfigCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    onBleConfigWrite(pCharacteristic->getValue());
  }

  void onRead(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    StaticJsonDocument<768> doc;
    doc["cylinderRadius"]      = cfg.cylinderRadius;
    doc["cylinderHeight"]      = cfg.cylinderHeight;
    doc["frustumTopRadius"]    = cfg.frustumTopRadius;
    doc["frustumBottomRadius"] = cfg.frustumBottomRadius;
    doc["frustumHeight"]       = cfg.frustumHeight;
    doc["sensorInterval"]      = cfg.sensorInterval;

    String out;
    serializeJson(doc, out);
    pCharacteristic->setValue(out.c_str());
  }
};

class BleStatusCallbacks : public NimBLECharacteristicCallbacks {
  void onRead(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    StaticJsonDocument<768> doc;
    buildDeviceStatusJson(doc);
    String out;
    serializeJson(doc, out);
    pCharacteristic->setValue(out.c_str());
  }
};

class BleTimeCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    (void)connInfo;
    onBleTimeWrite(pCharacteristic->getValue());
  }
};

void publishModeRestartResponse(const char *actionTag, bool success, const char *extraKey, const char *extraVal) {
  StaticJsonDocument<256> rsp;
  rsp["type"] = "control_response";
  rsp["data"]["action"] = actionTag;
  rsp["data"]["success"] = success;
  if (extraKey) rsp["data"][extraKey] = extraVal;
  rsp["timestamp"] = millis();
  broadcastResponse(rsp);
  flushPendingResponseTransport();
}

void restartApMode(bool apModeOn) {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putBool(PREFS_KEY_APMODE, apModeOn);
  prefs.end();
  delay(300);
  ESP.restart();
}

void handleMQTTMessage(const String &message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    sendError(0, "Invalid JSON");
    return;
  }

  String action = doc["action"] | "";

  if (action == "start_feed") {
    JsonObject params = doc["parameters"].as<JsonObject>();
    int augerSpeed     = params["augerSpeed"]    | doc["augerSpeed"]    | DEFAULT_AUGER_SPEED;
    int impellerSpeed  = params["impellerSpeed"] | doc["impellerSpeed"] | DEFAULT_IMPELLER_SPEED;
    unsigned long pre  = params["preSpinMs"]     | doc["preSpinMs"]     | DEFAULT_PRE_SPIN_MS;
    unsigned long feed = params["feedMs"]        | doc["feedMs"]        | DEFAULT_FEED_MS;
    unsigned long post = params["postSpinMs"]    | doc["postSpinMs"]    | DEFAULT_POST_SPIN_MS;

    startFeeding(augerSpeed, impellerSpeed, pre, feed, post);

    StaticJsonDocument<256> rsp;
    rsp["type"]              = "control_response";
    rsp["data"]["action"]    = "start_feed";
    rsp["data"]["success"]   = true;
    rsp["data"]["motorState"] = motorStateLabel(motor.state);
    rsp["timestamp"]         = millis();
    broadcastResponse(rsp);

  } else if (action == "stop_feed") {
    emergencyStop();

    StaticJsonDocument<256> rsp;
    rsp["type"]              = "control_response";
    rsp["data"]["action"]    = "stop_feed";
    rsp["data"]["success"]   = true;
    rsp["data"]["motorState"] = motorStateLabel(motor.state);
    rsp["timestamp"]         = millis();
    broadcastResponse(rsp);

  } else if (action == "clear_jam") {
    JsonObject params = doc["parameters"].as<JsonObject>();
    int speed          = params["speed"]    | doc["speed"]    | DEFAULT_AUGER_SPEED;
    unsigned long dur  = params["duration"] | doc["duration"] | DEFAULT_JAM_CLEAR_MS;

    startJamClear(speed, dur);

    StaticJsonDocument<256> rsp;
    rsp["type"]              = "control_response";
    rsp["data"]["action"]    = "clear_jam";
    rsp["data"]["success"]   = true;
    rsp["data"]["motorState"] = motorStateLabel(motor.state);
    rsp["timestamp"]         = millis();
    broadcastResponse(rsp);

  } else if (action == "get_sensors") {
    readSensors();
    sendSensorData(0);

  } else if (action == "set_sensor_interval") {
    cfg.sensorInterval = constrain(
      doc["parameters"]["interval"] | cfg.sensorInterval,
      MIN_SENSOR_INTERVAL, MAX_SENSOR_INTERVAL
    );
    saveConfig();

    StaticJsonDocument<256> rsp;
    rsp["type"]              = "control_response";
    rsp["data"]["action"]    = "set_sensor_interval";
    rsp["data"]["success"]   = true;
    rsp["data"]["interval"]  = cfg.sensorInterval;
    rsp["timestamp"]         = millis();
    broadcastResponse(rsp);

  } else if (action == "set_config") {
    if (doc.containsKey("parameters")) {
      JsonObject params = doc["parameters"];
      if (params.containsKey("cylinderRadius"))      cfg.cylinderRadius      = params["cylinderRadius"];
      if (params.containsKey("cylinderHeight"))      cfg.cylinderHeight      = params["cylinderHeight"];
      if (params.containsKey("frustumTopRadius"))    cfg.frustumTopRadius    = params["frustumTopRadius"];
      if (params.containsKey("frustumBottomRadius")) cfg.frustumBottomRadius = params["frustumBottomRadius"];
      if (params.containsKey("frustumHeight"))       cfg.frustumHeight       = params["frustumHeight"];

      totalVolumeCm3 = computeTotalVolume();
      saveConfig();

      StaticJsonDocument<256> rsp;
      rsp["type"]              = "control_response";
      rsp["data"]["action"]    = "set_config";
      rsp["data"]["success"]   = true;
      rsp["timestamp"]         = millis();
      broadcastResponse(rsp);
    }

  } else if (action == "ping") {
    handlePing(0);

  } else if (action == "get_schedules") {
    StaticJsonDocument<2048> rsp;
    rsp["type"] = "schedules_list";
    JsonArray arr = rsp.createNestedArray("data");

    for (uint8_t i = 0; i < scheduleStore.count; i++) {
      FeedSchedule &sch = scheduleStore.schedules[i];
      JsonObject obj = arr.createNestedObject();
      obj["id"] = sch.id;
      obj["label"] = sch.label;
      obj["time"] = sch.time;
      obj["daysOfWeek"] = sch.daysOfWeek;
      obj["augerSpeed"] = sch.augerSpeed;
      obj["impellerSpeed"] = sch.impellerSpeed;
      obj["preSpinMs"] = sch.preSpinMs;
      obj["feedMs"] = sch.feedMs;
      obj["postSpinMs"] = sch.postSpinMs;
      obj["enabled"] = sch.enabled;
    }
    rsp["timestamp"] = millis();
    broadcastResponse(rsp);

  } else if (action == "set_schedules") {
    JsonArray arr = doc["parameters"]["schedules"];
    applyScheduleArray(arr);

    StaticJsonDocument<256> rsp;
    rsp["type"] = "control_response";
    rsp["data"]["action"] = "set_schedules";
    rsp["data"]["success"] = true;
    rsp["timestamp"] = millis();
    broadcastResponse(rsp);

  } else if (action == "switch_mode") {
    String mode = doc["parameters"]["mode"] | "";
    mode.toLowerCase();

    if (mode == "ap") {
      publishModeRestartResponse("switch_mode", true, "mode", "ap");
      restartApMode(true);
    } else if (mode == "ble") {
      publishModeRestartResponse("switch_mode", true, "mode", "ble");
      restartApMode(false);
    } else {
      sendError(0, "switch_mode: unknown mode");
    }

  } else if (action == "restart_provisioning") {
    publishModeRestartResponse("restart_provisioning", true, nullptr, nullptr);
    restartApMode(true);

  } else {
    sendError(0, "Unknown action: " + action);
  }
}

void initBleStack(const String &deviceName) {
  NimBLEDevice::init(deviceName.c_str());

  FloydBLEServerCallbacks *srvCb = new FloydBLEServerCallbacks();
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(srvCb);

  NimBLEService *pService = pServer->createService(BLEUUID(BLE_UUID_SERVICE));

  NimBLECharacteristic *pCmd = pService->createCharacteristic(
                                 BLE_UUID_COMMAND,
                                 NIMBLE_PROPERTY::WRITE);
  pCmd->setCallbacks(new BleCommandCallbacks());

  bleRspChar = pService->createCharacteristic(
                 BLE_UUID_RESPONSE,
                 NIMBLE_PROPERTY::NOTIFY);

  bleTelChar = pService->createCharacteristic(
                 BLE_UUID_TELEMETRY,
                 NIMBLE_PROPERTY::NOTIFY);

  bleStaChar = pService->createCharacteristic(
                 BLE_UUID_STATUS,
                 NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  bleStaChar->setCallbacks(new BleStatusCallbacks());

  NimBLECharacteristic *pSch = pService->createCharacteristic(
                               BLE_UUID_SCHEDULES,
                               NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  pSch->setCallbacks(new BleScheduleCallbacks());

  NimBLECharacteristic *pCfg = pService->createCharacteristic(
                               BLE_UUID_CONFIG,
                               NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  pCfg->setCallbacks(new BleConfigCallbacks());

  NimBLECharacteristic *pTime = pService->createCharacteristic(
                                BLE_UUID_TIME,
                                NIMBLE_PROPERTY::WRITE);
  pTime->setCallbacks(new BleTimeCallbacks());

  bleFeedlogChar = pService->createCharacteristic(
                     BLE_UUID_FEEDLOG,
                     NIMBLE_PROPERTY::NOTIFY);

  pService->start();

  NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->setName(deviceName.c_str());
  pAdvertising->addServiceUUID(BLEUUID(BLE_UUID_SERVICE));
  pAdvertising->enableScanResponse(true);
  NimBLEDevice::startAdvertising();

  Serial.println("NimBLE advertising as " + deviceName);
}

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n=== Floyd Fish Feeder v2.2 — BLE + SoftAP/MQTT fallback ===");
  Serial.println("========================================\n");

  initMotorPins();
  setupMQTTTopics();

  loadConfig();
  loadSchedules();
  totalVolumeCm3 = computeTotalVolume();

  prefs.begin(PREFS_NAMESPACE, false);
  bool apModePref = prefs.getBool(PREFS_KEY_APMODE, false);
  prefs.end();

  apModeRuntime = apModePref;

  String deviceName = "FloydFeeder-" + deviceChipId;

  if (apModeRuntime) {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(deviceName.c_str());
    Serial.println("SoftAP: " + deviceName + " IP " + WiFi.softAPIP().toString());

    broker.init(1883);
    Serial.println("MQTT broker on :1883");

    lastMqttRx = millis();
  } else {
    WiFi.mode(WIFI_OFF);
    initBleStack(deviceName);
  }

  Serial.println("Setup complete.");
  Serial.println("Device ID:    " + deviceChipId);
  Serial.println("Mode:         " + String(apModeRuntime ? "AP+MQTT" : "BLE"));
  Serial.println("Total volume: " + String(totalVolumeCm3) + " cm3");
}

void loop() {
  yield();

  if (apModeRuntime) {
    broker.update();

    if (elapsedSince(lastMqttRx) > 60000UL) {
      Serial.println("MQTT idle timeout → BLE mode");
      prefs.begin(PREFS_NAMESPACE, false);
      prefs.putBool(PREFS_KEY_APMODE, false);
      prefs.end();
      delay(200);
      ESP.restart();
    }
  }

  checkSchedules();

  if (pendingCommand) {
    pendingCommand = false;
    handleMQTTMessage(pendingCommandPayload);
    pendingCommandPayload = "";
  }

  flushPendingResponseTransport();

  updateMotorState();

  unsigned long now = millis();
  if (now - lastSensorRead >= cfg.sensorInterval) {
    lastSensorRead = now;
    readSensors();
    broadcastSensorData();
  }

  delay(10);
}
