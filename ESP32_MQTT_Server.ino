// Floyd Feeder v2.1 — L298N Motor Driver Firmware (Optimized)
// ESP32 MQTT client controlling auger + impeller via L298N
#include <WiFi.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <Preferences.h>

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
  char mqttBroker[64]         = "4db1d3fef94e4b7d9600811e579488e7.s1.eu.hivemq.cloud";
  char mqttUsername[33]       = "floyd-server";
  char mqttPassword[33]       = "@@Feedfrendz11@@";
  bool provisioned            = false;
};

AppConfig cfg;
Preferences prefs;

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

WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

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
unsigned long lastMqttAttempt    = 0;
unsigned int  mqttReconnectDelay = 1000;
#define WIFI_CHECK_INTERVAL         30000
#define WIFI_DOWN_REBOOT_MS         120000  // reboot if WiFi down > 2 min
#define MQTT_RECONNECT_BASE_DELAY   1000
#define MQTT_RECONNECT_MAX_DELAY    60000

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
void connectMQTT();
void broadcastResponse(JsonDocument& doc);
void sendDeviceStatus(uint8_t num);
const char* motorStateLabel(MotorState st);

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
    Serial.print("No valid config in NVS (got ");
    Serial.print(len);
    Serial.print(" bytes, expected ");
    Serial.print(sizeof(AppConfig));
    Serial.println("), using defaults");
  }
  prefs.end();

  // === DIAGNOSTIC: dump loaded credentials ===
  Serial.println("--- CREDS DIAG ---");
  Serial.print("  ssid="); Serial.println(cfg.wifiSSID);
  Serial.print("  broker="); Serial.println(cfg.mqttBroker);
  Serial.print("  user="); Serial.println(cfg.mqttUsername);
  Serial.print("  pass_len="); Serial.println(strlen(cfg.mqttPassword));
  Serial.print("  pass[0..3]=");
  for (int i = 0; i < min(strlen(cfg.mqttPassword), (size_t)4); i++)
    Serial.print(cfg.mqttPassword[i]);
  Serial.println();
  Serial.print("  provisioned="); Serial.println(cfg.provisioned);
  Serial.println("------------------");
}

void saveConfig() {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putBytes(PREFS_KEY_CFG, &cfg, sizeof(AppConfig));
  prefs.end();
  Serial.println("Saved config to NVS");
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

String generateMqttPassword() {
  // Use both cycle count and MAC for better randomness
  uint32_t seed = ESP.getCycleCount();
  for (int i = 0; i < 6; i++) seed ^= (uint32_t)ESP.getEfuseMac() >> (i * 8);
  randomSeed(seed);
  return String(random(0x10000000, 0x7FFFFFFF), HEX);
}

void startProvisioningMode() {
  WiFiManager wm;

  if (cfg.mqttPassword[0] == '\0') {
    String pw = generateMqttPassword();
    strncpy(cfg.mqttPassword, pw.c_str(), 32);
    cfg.mqttPassword[32] = '\0';
  }

  WiFiManagerParameter customDeviceId("deviceId", "Device ID", deviceChipId.c_str(), 20);
  WiFiManagerParameter customDeviceName("deviceName", "Device Name", "Floyd Feeder", 32);
  WiFiManagerParameter customMqttBroker("mqttBroker", "MQTT Broker", cfg.mqttBroker, 64);
  WiFiManagerParameter customMqttUsername("mqttUsername", "MQTT Username", cfg.mqttUsername, 32);
  WiFiManagerParameter customMqttPassword("mqttPassword", "MQTT Password", cfg.mqttPassword, 32);

  wm.setCustomHeadElement(
    "<style>body{font-family:system-ui,sans-serif;}button{background:#2e7d32!important;}</style>"
    "<p><strong>Floyd Fish Feeder Setup</strong></p>"
    "<p>Save the device ID and MQTT credentials shown below. The app uses them to claim this feeder.</p>"
  );
  wm.addParameter(&customDeviceId);
  wm.addParameter(&customDeviceName);
  wm.addParameter(&customMqttBroker);
  wm.addParameter(&customMqttUsername);
  wm.addParameter(&customMqttPassword);
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
  strncpy(cfg.mqttBroker,   customMqttBroker.getValue(),   63);
  cfg.mqttBroker[63]   = '\0';
  strncpy(cfg.mqttUsername, customMqttUsername.getValue(), 32);
  cfg.mqttUsername[32] = '\0';
  strncpy(cfg.mqttPassword, customMqttPassword.getValue(), 32);
  cfg.mqttPassword[32] = '\0';
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
//  MQTT
// ============================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  message.reserve(length);
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  if (String(topic) == topicCommand) {
    pendingCommandPayload = message;
    pendingCommand = true;
  }
}

void connectMQTT() {
  if (mqttClient.connected()) return;

  wifiClient.setInsecure();
  wifiClient.setTimeout(5000);

  // === DIAGNOSTIC: show what we're connecting with ===
  Serial.print("MQTT connecting: clientId="); Serial.print(mqttClientId);
  Serial.print(" broker="); Serial.print(cfg.mqttBroker);
  Serial.print(":8883 user=");
  Serial.print(cfg.mqttUsername[0] ? cfg.mqttUsername : "(null)");
  Serial.print(" pass_len="); Serial.print(strlen(cfg.mqttPassword));
  Serial.println();

  String willPayload = R"({"type":"status","data":{"connected":false}})";
  const char* user = (cfg.mqttUsername[0] != '\0') ? cfg.mqttUsername : nullptr;

  bool ok = mqttClient.connect(
    mqttClientId.c_str(), user, cfg.mqttPassword,
    topicStatus.c_str(), 0, true, willPayload.c_str()
  );

  if (ok) {
    Serial.println("MQTT connected, subscribing...");
    mqttClient.subscribe(topicCommand.c_str());
    mqttReconnectDelay = MQTT_RECONNECT_BASE_DELAY;  // reset backoff
    sendDeviceStatus(0);
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.print(mqttClient.state());
    // -4=TIMEOUT  -2=CONNECT_FAILED  5=UNAUTHORIZED (bad creds)
    const char* reason = "";
    switch (mqttClient.state()) {
      case -4: reason = " (TIMEOUT)";               break;
      case -3: reason = " (CONNECTION_LOST)";       break;
      case -2: reason = " (TCP connect failed)";     break;
      case  5: reason = " (UNAUTHORIZED — check user/pass)"; break;
    }
    Serial.println(reason);
  }
}

void configureMQTTClient() {
  mqttClientId = "floyd-" + deviceChipId;
  mqttClient.setServer(cfg.mqttBroker, 8883);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setBufferSize(1024);
}

void checkMQTTConnection() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  // Exponential backoff to avoid reconnect storms
  if (millis() - lastMqttAttempt < mqttReconnectDelay) return;
  lastMqttAttempt = millis();

  Serial.print("MQTT reconnecting (delay=");
  Serial.print(mqttReconnectDelay);
  Serial.println("ms)...");

  connectMQTT();

  if (!mqttClient.connected()) {
    mqttReconnectDelay = min(mqttReconnectDelay * 2, (unsigned int)MQTT_RECONNECT_MAX_DELAY);
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
  if (mqttClient.connected()) {
    mqttClient.publish(topicTelemetry.c_str(), output.c_str());
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
  if (mqttClient.connected()) {
    mqttClient.publish(topicStatus.c_str(), output.c_str(), true);
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
  totalVolumeCm3 = computeTotalVolume();

  if (!cfg.provisioned || cfg.wifiSSID[0] == '\0') {
    Serial.println("No saved WiFi credentials. Starting provisioning mode...");
    startProvisioningMode();
  }

  connectToWiFi();
  configureMQTTClient();
  connectMQTT();

  Serial.println("Setup complete. Ready for MQTT.");
  Serial.println("Device ID:    " + deviceChipId);
  Serial.println("MQTT Client:  " + mqttClientId);
  Serial.println("MQTT Broker:  " + String(cfg.mqttBroker));
  Serial.println("Total volume: " + String(totalVolumeCm3) + " cm3");
}

// ============================================================
//  Loop
// ============================================================

void loop() {
  yield();

  checkWiFiConnection();
  checkMQTTConnection();
  mqttClient.loop();

  if (pendingCommand) {
    pendingCommand = false;
    handleMQTTMessage(pendingCommandPayload);
    pendingCommandPayload = "";
  }

  if (pendingResponse.length() > 0 && mqttClient.connected()) {
    mqttClient.publish(topicResponse.c_str(), pendingResponse.c_str());
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
