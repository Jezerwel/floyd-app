// Floyd Feeder v2.1 — L298N Motor Driver Firmware (Optimized)
// ESP32 MQTT client controlling auger + impeller via L298N
#include <WiFi.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <ezTime.h>
#include <sMQTTBroker.h>

// ——— Persisted Config ————————————————
#define PREFS_NAMESPACE  "floyd-cfg"
#define PREFS_KEY_CFG    "cfg"

struct AppConfig {
  float cylinderRadius        = 10.0f;
  float cylinderHeight        = 25.4f;
  float frustumTopRadius      = 10.0f;
  float frustumBottomRadius   = 5.0f;
  float frustumHeight         = 15.0f;
  unsigned long sensorInterval = 5000;
  char wifiSSID[33]           = "";
  char wifiPassword[65]       = "";
  bool provisioned            = false;
};

AppConfig cfg;
Preferences prefs;
Timezone tzLocal;

// ——— Schedule Persistence ——————————————
#define MAX_SCHEDULES 10
#define PREFS_KEY_SCHEDULES "sched"

struct FeedSchedule {
  char id[13];           // 12-char hex + null
  char label[33];        // schedule name
  char time[6];          // "HH:MM"
  char daysOfWeek[14];   // "0,1,2,3,4,5,6"
  int augerSpeed;
  int impellerSpeed;
  unsigned long preSpinMs;
  unsigned long feedMs;
  unsigned long postSpinMs;
  bool enabled;
  unsigned long lastFired; // millis() of last trigger
};

struct ScheduleStore {
  uint8_t count;
  FeedSchedule schedules[MAX_SCHEDULES];
};

ScheduleStore scheduleStore;

// ——— Device Identity ————————————————————
String      deviceChipId = String((uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF), HEX);
String      mqttClientId = "floyd-" + deviceChipId;
String      topicCommand;
String      topicTelemetry;
String      topicStatus;
String      topicResponse;

String      pendingCommandPayload;
String      pendingResponse;
volatile bool pendingCommand = false;

// ——— Embedded MQTT Broker ———————————————
sMQTTBroker broker;
WiFiServer  wifiServer(1883);  // MQTT broker on port 1883

// ——— Pin Definitions ————————————————————
// L298N Motor Driver
#define MOTOR_A_ENA    14
#define MOTOR_A_IN1    12
#define MOTOR_A_IN2    13
#define MOTOR_B_ENB    0
#define MOTOR_B_IN3    15
#define MOTOR_B_IN4    16

// ——— LEDC PWM Channels ——————————————————
#define LEDC_CH_AUGER     0
#define LEDC_CH_IMPELLER  1
#define LEDC_FREQ         25000   // 25 kHz — above audible range
#define LEDC_RESOLUTION   10      // 10-bit → 0-1023

// ——— Feeding Sequence ———————————————————
#define DEFAULT_PRE_SPIN_MS      1500
#define DEFAULT_POST_SPIN_MS     1500
#define DEFAULT_FEED_MS          3000
#define MIN_FEED_MS              500
#define MAX_FEED_MS              30000
#define DEFAULT_JAM_CLEAR_MS     2000
#define DEFAULT_AUGER_SPEED      768
#define DEFAULT_IMPELLER_SPEED   1023

// ——— Container Geometry ————————————————
// Two-part container: Cylinder (top) + Conical Frustum (bottom)
// Transition point: 10 inches (= 25.4 cm) from sensor
float totalVolumeCm3 = 0;

// ——— Sensor Timing ——————————————————————
unsigned long lastSensorRead = 0;
#define MIN_SENSOR_INTERVAL      1000
#define MAX_SENSOR_INTERVAL      60000

// ——— WiFi / MQTT Reconnect ——————————————
unsigned long lastWiFiCheck      = 0;
unsigned long wifiDownSince       = 0;
#define WIFI_CHECK_INTERVAL         30000
#define WIFI_DOWN_REBOOT_MS         120000  // reboot if WiFi down > 2 min

// ——— Motor State Machine ————————————————
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

// ——— Sensor Data ————————————————————————
struct SensorData {
  float foodLevelPercentage = 0;
} sensors;

// ——— Forward Declarations ———————————————
void broadcastResponse(JsonDocument& doc);
void sendDeviceStatus(uint8_t num);
const char* motorStateLabel(MotorState st);

// ——— Broker Command Callback —————————————
void onBrokerMessage(const String& topic, const String& message) {
  if (topic == topicCommand) {
    pendingCommandPayload = message;
    pendingCommand = true;
  }
}

// ============================================================
//  Preferences Config Save / Load
// ============================================================

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

void syncNTP() {
  if (WiFi.status() != WL_CONNECTED) return;

  static bool ntpSynced = false;
  if (!ntpSynced) {
    Serial.println("Syncing NTP time...");
    if (waitForSync(10000)) {
      tzLocal.setLocation(F("Asia/Shanghai"));  // default; user-configurable later
      Serial.println("NTP synced: " + UTC.dateTime());
      ntpSynced = true;
    } else {
      Serial.println("NTP sync timeout — will retry");
    }
  }

  if (ntpSynced) {
    events();  // ezTime event processing
  }
}

void checkSchedules() {
  if (!UTC.isSet()) return;  // no NTP time yet

  String nowTime = UTC.dateTime("H:i");    // "HH:MM"
  int nowDow = UTC.dateTime("w").toInt();  // 0=Sun, 1=Mon, ...

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    FeedSchedule& sch = scheduleStore.schedules[i];
    if (!sch.enabled) continue;

    String schTime = String(sch.time);
    if (schTime != nowTime) continue;

    // Check day of week
    String days = String(sch.daysOfWeek);
    if (days.indexOf(String(nowDow)) < 0) continue;

    // Prevent re-firing in the same minute
    if (sch.lastFired != 0) {
      unsigned long nowMillis = millis();
      if (nowMillis - sch.lastFired < 59000) continue;  // 59s debounce
    }

    // Fire the feed
    sch.lastFired = millis();
    startFeeding(sch.augerSpeed, sch.impellerSpeed, sch.preSpinMs, sch.feedMs, sch.postSpinMs);

    Serial.printf("Scheduled feed: %s at %s\n", sch.label, nowTime.c_str());
  }
}

// ============================================================
//  millis() Overflow-Safe Helper
// ============================================================

unsigned long elapsedSince(unsigned long since) {
  unsigned long now = millis();
  return (now >= since) ? (now - since) : (0xFFFFFFFF - since) + now + 1;
}

// ============================================================
//  Board Setup Helpers
// ============================================================

void initMotorPins() {
  // LEDC PWM for motor speed (25 kHz, 10-bit → 0-1023)
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

// ============================================================
//  WiFi Provisioning (WiFiManager)
// ============================================================

void startProvisioningMode() {
  WiFiManager wm;

  WiFiManagerParameter customDeviceId("deviceId", "Device ID", deviceChipId.c_str(), 20);
  WiFiManagerParameter customDeviceName("deviceName", "Device Name", "Floyd Feeder", 32);

  wm.setCustomHeadElement(
    "<style>body{font-family:system-ui,sans-serif;}button{background:#2e7d32!important;}</style>"
    "<p><strong>Floyd Fish Feeder Setup</strong></p>"
    "<p>Enter your home WiFi credentials below. The feeder will connect to your network.</p>"
  );
  wm.addParameter(&customDeviceId);
  wm.addParameter(&customDeviceName);
  wm.setConfigPortalTimeout(180);
  wm.setConnectTimeout(30);

  String apName = "FloydFeeder-" + deviceChipId;
  Serial.println("Starting provisioning AP: " + apName);

  if (!wm.autoConnect(apName.c_str())) {
    Serial.println("Provisioning timed out, restarting...");
    delay(3000);
    ESP.restart();
  }

  strncpy(cfg.wifiSSID,     WiFi.SSID().c_str(), 32);
  cfg.wifiSSID[32]     = '\0';
  strncpy(cfg.wifiPassword, WiFi.psk().c_str(),  64);
  cfg.wifiPassword[64] = '\0';
  cfg.provisioned = true;

  saveConfig();
  Serial.println("Provisioning complete. Restarting...");
  delay(1000);
  ESP.restart();
}

// ============================================================
//  WiFi Connection (+ Event Handler)
// ============================================================

void onWiFiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println("WiFi disconnected (event)");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.println("WiFi got IP: " + WiFi.localIP().toString());
      break;
    default:
      break;
  }
}

void connectToWiFi() {
  WiFi.onEvent(onWiFiEvent);

  Serial.print("Connecting to WiFi: ");
  Serial.println(cfg.wifiSSID);

  WiFi.begin(cfg.wifiSSID, cfg.wifiPassword);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < 15000) {
    delay(500);
    Serial.print(".");
    yield();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.print("IP: ");  Serial.println(WiFi.localIP());
    Serial.print("RSSI: "); Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("WiFi connection failed (will retry in loop)");
  }
}

void checkWiFiConnection() {
  // DO NOT call WiFi.disconnect() + WiFi.begin() during reconnect.
  // The ESP32 auto-reconnect runs on its own and will reject a
  // manual begin() while "sta is connecting". Just monitor + reboot.
  if (millis() - lastWiFiCheck < WIFI_CHECK_INTERVAL) return;
  lastWiFiCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (wifiDownSince == 0) {
      wifiDownSince = millis();
      Serial.println("WiFi disconnected — waiting for auto-reconnect...");
    } else if (millis() - wifiDownSince > WIFI_DOWN_REBOOT_MS) {
      Serial.println("WiFi down too long, rebooting...");
      ESP.restart();
    }
  } else {
    wifiDownSince = 0;  // connected, reset timer
  }
}

// ============================================================
//  Motor Driving Primitives (LEDC PWM @ 25 kHz)
// ============================================================

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

// ============================================================
//  Motor State Label Helper (single source of truth)
// ============================================================

const char* motorStateLabel(MotorState st) {
  switch (st) {
    case STATE_IDLE:       return "idle";
    case STATE_PRE_SPIN:   return "pre_spin";
    case STATE_FEEDING:    return "feeding";
    case STATE_POST_SPIN:  return "post_spin";
    case STATE_JAM_CLEAR:  return "jam_clear";
    default:               return "idle";
  }
}

// ============================================================
//  Motor State Machine Tick
// ============================================================

void sendFeedingComplete();
void sendJamClearComplete();

void updateMotorState() {
  MotorControl& mc = motor;
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

// ============================================================
//  Feed Trigger & Jam Clear
// ============================================================

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

  motor.state         = STATE_PRE_SPIN;
  motor.stateStartTime = millis();
}

void startJamClear(int speed, unsigned long duration) {
  speed    = constrain(speed, 0, 1023);
  duration = constrain(duration, 500, 5000);

  motor.jamClearMs = duration;

  setImpellerMotor(0);
  setAugerMotor(speed, false);

  motor.state         = STATE_JAM_CLEAR;
  motor.stateStartTime = millis();
}

void emergencyStop() {
  motor.state         = STATE_STOPPING;
  motor.stateStartTime = millis();
}

// ============================================================
//  Volume-Based Food Level Calculation
// ============================================================

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

// ============================================================
//  Sensors
// ============================================================

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

// ============================================================
//  JSON Response Helpers
// ============================================================

void broadcastResponse(JsonDocument& doc) {
  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

// Single helper to fill motor/sensor fields into a JsonObject
void fillMotorData(JsonObject& data) {
  data["motorState"]     = motorStateLabel(motor.state);
  data["augerSpeed"]     = motor.augerSpeed;
  data["impellerSpeed"]  = motor.impellerSpeed;
}

void fillSensorData(JsonObject& data) {
  data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10.0f) / 10.0f;
}

// ============================================================
//  MQTT Messaging
// ============================================================

void broadcastSensorData() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");
  fillSensorData(data);
  fillMotorData(data);
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  broker.publish(topicTelemetry.c_str(), output.c_str());
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
  StaticJsonDocument<512> doc;
  doc["type"] = "status";
  JsonObject data = doc.createNestedObject("data");
  data["connected"]  = true;
  data["uptime"]     = millis();
  data["freeHeap"]   = ESP.getFreeHeap();
  data["wifiRssi"]   = WiFi.RSSI();
  data["sensorInterval"] = cfg.sensorInterval;
  data["motorState"] = motorStateLabel(motor.state);

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

  String output;
  serializeJson(doc, output);
  broker.publish(topicStatus.c_str(), output.c_str(), true);
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

void sendError(uint8_t num, const String& errorMessage) {
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

// ============================================================
//  MQTT Command Handler
// ============================================================

void handleMQTTMessage(const String& message) {
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
      FeedSchedule& sch = scheduleStore.schedules[i];
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
    scheduleStore.count = min((uint8_t)arr.size(), (uint8_t)MAX_SCHEDULES);

    for (uint8_t i = 0; i < scheduleStore.count; i++) {
      JsonObject obj = arr[i];
      FeedSchedule& sch = scheduleStore.schedules[i];
      strncpy(sch.id, obj["id"] | "", 12);
      strncpy(sch.label, obj["label"] | "Feed", 32);
      strncpy(sch.time, obj["time"] | "08:00", 5);
      strncpy(sch.daysOfWeek, obj["daysOfWeek"] | "0,1,2,3,4,5,6", 13);
      sch.augerSpeed = obj["augerSpeed"] | 768;
      sch.impellerSpeed = obj["impellerSpeed"] | 1023;
      sch.preSpinMs = obj["preSpinMs"] | 1500;
      sch.feedMs = obj["feedMs"] | 3000;
      sch.postSpinMs = obj["postSpinMs"] | 1500;
      sch.enabled = obj["enabled"] | true;
      sch.lastFired = 0;
    }

    saveSchedules();

    StaticJsonDocument<256> rsp;
    rsp["type"] = "control_response";
    rsp["data"]["action"] = "set_schedules";
    rsp["data"]["success"] = true;
    rsp["timestamp"] = millis();
    broadcastResponse(rsp);

  } else if (action == "ping") {
    handlePing(0);

  } else if (action == "get_schedules")

  } else if (action == "restart_provisioning") {
    StaticJsonDocument<256> rsp;
    rsp["type"]              = "control_response";
    rsp["data"]["action"]    = "restart_provisioning";
    rsp["data"]["success"]   = true;
    rsp["timestamp"]         = millis();
    broadcastResponse(rsp);

    // Flush pending response before wiping NVS
    String output;
    serializeJson(rsp, output);
    broker.publish(topicResponse.c_str(), output.c_str());
    delay(200);

    // Clear NVS so next boot enters AP provisioning mode
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.clear();
    prefs.end();
    Serial.println("Provisioning reset. Rebooting to AP mode...");
    delay(500);
    ESP.restart();

  } else {
    sendError(0, "Unknown action: " + action);
  }
}

// ============================================================
//  Setup
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n=== Floyd Fish Feeder v2.1 — L298N Motor Driver (ESP32) ===");
  Serial.println("Pins: Auger (14/12/13)  Impeller (0/15/16)");
  Serial.println("========================================\n");

  initMotorPins();
  setupMQTTTopics();

  loadConfig();
  loadSchedules();
  totalVolumeCm3 = computeTotalVolume();

  if (!cfg.provisioned || cfg.wifiSSID[0] == '\0') {
    Serial.println("No saved WiFi credentials. Starting provisioning mode...");
    startProvisioningMode();
  }

  connectToWiFi();

  // Advertise MQTT service via mDNS so the app can discover us
  bool mdnsOk = MDNS.begin(("floyd-feeder-" + deviceChipId).c_str());
  if (mdnsOk) {
    MDNS.addService("mqtt", "tcp", 1883);
    Serial.println("mDNS started: floyd-feeder-" + deviceChipId + ".local");
  } else {
    Serial.println("WARNING: mDNS failed to start");
  }

  // Start embedded MQTT broker on port 1883
  wifiServer.begin(1883);
  broker.init();
  Serial.println("MQTT broker started on port 1883");

  Serial.println("Setup complete. Ready for local MQTT.");
  Serial.println("Device ID:    " + deviceChipId);
  Serial.println("MQTT ID:      " + mqttClientId);
  Serial.println("Total volume: " + String(totalVolumeCm3) + " cm3");
}

// ============================================================
//  Loop
// ============================================================

void loop() {
  yield();

  // Keep mDNS alive (required for ESPmDNS)
  MDNS.update();

  static unsigned long lastNtpUpdate = 0;
  if (millis() - lastNtpUpdate > 60000) {  // resync every 60s
    lastNtpUpdate = millis();
    syncNTP();
  }

  checkSchedules();

  checkWiFiConnection();

  // Accept new MQTT client connections to the embedded broker
  WiFiClient brokerClient = wifiServer.available();
  if (brokerClient) {
    broker.accept(brokerClient);
  }
  broker.update();

  if (pendingCommand) {
    pendingCommand = false;
    handleMQTTMessage(pendingCommandPayload);
    pendingCommandPayload = "";
  }

  if (pendingResponse.length() > 0) {
    broker.publish(topicResponse.c_str(), pendingResponse.c_str());
    pendingResponse = "";
  }

  updateMotorState();

  unsigned long now = millis();
  if (now - lastSensorRead >= cfg.sensorInterval) {
    lastSensorRead = now;
    readSensors();
    broadcastSensorData();
  }

  delay(10);
}
