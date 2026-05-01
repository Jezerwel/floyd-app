// Floyd Feeder v2 — L298N Motor Driver Firmware
// ESP8266 MQTT client controlling auger + impeller via L298N
#include <ESP8266WiFi.h>
#include <EspMQTTClient.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <EEPROM.h>

char savedSSID[33] = "";
char savedPassword[65] = "";
char savedMqttBroker[64] = "broker.hivemq.com";

String deviceChipId = String(ESP.getChipId(), HEX);
String mqttPassword = "";
String mqttClientId = "floyd-" + deviceChipId;
String topicCommand;
String topicTelemetry;
String topicStatus;
String topicResponse;
String pendingCommandPayload = "";
String pendingResponse = "";
volatile bool pendingCommand = false;

EspMQTTClient mqttClient(1883, "floyd-unconfigured");

// === Pin Definitions ===

// L298N Motor Driver
#define MOTOR_A_ENA    D5   // GPIO14 — Auger PWM (speed 0-1023)
#define MOTOR_A_IN1    D6   // GPIO12 — Auger Direction 1
#define MOTOR_A_IN2    D7   // GPIO13 — Auger Direction 2
#define MOTOR_B_ENB    D3   // GPIO0  — Impeller PWM (speed 0-1023)
#define MOTOR_B_IN3    D8   // GPIO15 — Impeller Direction 3
#define MOTOR_B_IN4    D0   // GPIO16 — Impeller Direction 4

// HC-SR04 Ultrasonic
#define TRIG_PIN       D1   // GPIO5
#define ECHO_PIN       D2   // GPIO4

// DS18B20 Temperature
#define ONE_WIRE_BUS   D4   // GPIO2

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature temperatureSensor(&oneWire);

// === Feeding Sequence Configuration ===
// All durations in milliseconds — easily editable

#define DEFAULT_PRE_SPIN_MS      1500   // Impeller spin before auger starts
#define DEFAULT_POST_SPIN_MS     1500   // Impeller spin after auger stops
#define DEFAULT_FEED_MS          3000   // Auger run duration
#define MIN_FEED_MS              500    // Safety: minimum feed duration
#define MAX_FEED_MS              30000  // Safety: maximum feed duration (30s)
#define DEFAULT_JAM_CLEAR_MS     2000   // Auger reverse duration for jam clear

#define DEFAULT_AUGER_SPEED      768    // 75% duty cycle (slow, high torque)
#define DEFAULT_IMPELLER_SPEED   1023   // 100% duty cycle (full speed)

// === Container Geometry (editable — measure your physical container) ===
// Two-part container: Cylinder (top) + Conical Frustum (bottom)
// Transition point: 10 inches (= 25.4 cm) from sensor — where cylinder meets frustum

float cylinderRadius      = 10.0;   // Radius of cylinder section (cm)
float cylinderHeight      = 25.4;   // Height of cylinder = 10 inches (cm)
float frustumTopRadius    = 10.0;   // Radius at top of frustum (same as cylinder)
float frustumBottomRadius = 5.0;    // Radius at bottom of frustum (cm)
float frustumHeight       = 15.0;   // Height of frustum section (cm)

// Derived total volume (calculated once at boot)
float totalVolumeCm3 = 0;

// === Sensor Timing ===
unsigned long lastSensorRead = 0;
unsigned long sensorInterval = 5000; // ms between sensor reads
#define MIN_SENSOR_INTERVAL      1000
#define MAX_SENSOR_INTERVAL      60000

// === WiFi ===
unsigned long lastWiFiCheck = 0;
unsigned long wifiReconnectAttempts = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;
const unsigned long MAX_WIFI_RECONNECT_ATTEMPTS = 5;

// === Motor State Machine ===
enum MotorState {
  STATE_IDLE,          // Both motors stopped
  STATE_PRE_SPIN,      // Impeller running, auger stopped
  STATE_FEEDING,       // Both motors running
  STATE_POST_SPIN,     // Auger stopped, impeller running
  STATE_JAM_CLEAR,     // Auger reverse
  STATE_STOPPING       // Slowing to stop (graceful)
};

struct MotorControl {
  MotorState state = STATE_IDLE;

  // Timing
  unsigned long stateStartTime = 0;
  unsigned long preSpinMs = DEFAULT_PRE_SPIN_MS;
  unsigned long feedMs = DEFAULT_FEED_MS;
  unsigned long postSpinMs = DEFAULT_POST_SPIN_MS;
  unsigned long jamClearMs = DEFAULT_JAM_CLEAR_MS;

  // Speeds (0-1023)
  int augerSpeed = DEFAULT_AUGER_SPEED;
  int impellerSpeed = DEFAULT_IMPELLER_SPEED;
};

MotorControl motor;

// === Sensor Data ===
struct SensorData {
  float temperature;
  bool temperatureSensorConnected;
  float distance;
  float foodLevelPercentage;
  bool ultrasonicSensorConnected;
} sensors;

// ============================================================
//  EEPROM Config Save/Load
// ============================================================

struct EEPROMConfig {
  float cylinderRadius;
  float cylinderHeight;
  float frustumTopRadius;
  float frustumBottomRadius;
  float frustumHeight;
  unsigned long sensorInterval;
  char wifiSSID[33];
  char wifiPassword[65];
  char mqttBroker[64];
  char mqttPassword[33];
  bool provisioned;
  uint8_t checksum;
};

uint8_t calculateConfigChecksum(const EEPROMConfig& config) {
  return (uint8_t)((int)config.cylinderRadius + (int)config.cylinderHeight +
                 (int)config.frustumTopRadius + (int)config.frustumBottomRadius +
                 (int)config.frustumHeight + (int)config.sensorInterval +
                 strlen(config.wifiSSID) + strlen(config.wifiPassword) +
                 strlen(config.mqttBroker) + strlen(config.mqttPassword) +
                 (config.provisioned ? 1 : 0)) & 0xFF;
}

bool loadConfig() {
  EEPROM.begin(sizeof(EEPROMConfig));
  EEPROMConfig config;
  EEPROM.get(0, config);

  if (calculateConfigChecksum(config) == config.checksum) {
    cylinderRadius = config.cylinderRadius;
    cylinderHeight = config.cylinderHeight;
    frustumTopRadius = config.frustumTopRadius;
    frustumBottomRadius = config.frustumBottomRadius;
    frustumHeight = config.frustumHeight;
    sensorInterval = config.sensorInterval;

    strncpy(savedSSID, config.wifiSSID, 32);
    savedSSID[32] = '\0';
    strncpy(savedPassword, config.wifiPassword, 64);
    savedPassword[64] = '\0';
    strncpy(savedMqttBroker, config.mqttBroker, 63);
    savedMqttBroker[63] = '\0';
    mqttPassword = String(config.mqttPassword);

    Serial.println("Loaded config from EEPROM");
    return config.provisioned;
  } else {
    Serial.println("EEPROM checksum invalid, using defaults");
    return false;
  }
}

void saveConfig() {
  EEPROMConfig config;
  config.cylinderRadius = cylinderRadius;
  config.cylinderHeight = cylinderHeight;
  config.frustumTopRadius = frustumTopRadius;
  config.frustumBottomRadius = frustumBottomRadius;
  config.frustumHeight = frustumHeight;
  config.sensorInterval = sensorInterval;
  strncpy(config.wifiSSID, savedSSID, 32);
  config.wifiSSID[32] = '\0';
  strncpy(config.wifiPassword, savedPassword, 64);
  config.wifiPassword[64] = '\0';
  strncpy(config.mqttBroker, savedMqttBroker, 63);
  config.mqttBroker[63] = '\0';
  strncpy(config.mqttPassword, mqttPassword.c_str(), 32);
  config.mqttPassword[32] = '\0';
  config.provisioned = savedSSID[0] != '\0' && mqttPassword.length() > 0;
  config.checksum = calculateConfigChecksum(config);

  EEPROM.put(0, config);
  EEPROM.commit();
  Serial.println("Saved config to EEPROM");
}

// ============================================================
//  millis() Overflow-Safe Helper
// ============================================================

unsigned long elapsedSince(unsigned long since) {
  unsigned long now = millis();
  if (now >= since) return now - since;
  return (0xFFFFFFFF - since) + now + 1;
}

// ============================================================
//  WiFi
// ============================================================

void setupMQTTTopics() {
  topicCommand = "floyd/devices/" + deviceChipId + "/command";
  topicTelemetry = "floyd/devices/" + deviceChipId + "/telemetry";
  topicStatus = "floyd/devices/" + deviceChipId + "/status";
  topicResponse = "floyd/devices/" + deviceChipId + "/response";
}

String generateMqttPassword() {
  randomSeed(ESP.getCycleCount());
  return String(random(0x10000000, 0x7FFFFFFF), HEX);
}

void startProvisioningMode() {
  WiFiManager wifiManager;

  if (mqttPassword.length() == 0) {
    mqttPassword = generateMqttPassword();
  }

  WiFiManagerParameter customDeviceId("deviceId", "Device ID", deviceChipId.c_str(), 20);
  WiFiManagerParameter customDeviceName("deviceName", "Device Name", "Floyd Feeder", 32);
  WiFiManagerParameter customMqttPassword("mqttPassword", "MQTT Password", mqttPassword.c_str(), 32);

  wifiManager.setCustomHeadElement(
    "<style>body{font-family:system-ui,sans-serif;}button{background:#2e7d32!important;}</style>"
    "<p><strong>Floyd Fish Feeder Setup</strong></p>"
    "<p>Save the device ID and MQTT password shown below. The app uses them to claim this feeder.</p>"
  );
  wifiManager.addParameter(&customDeviceId);
  wifiManager.addParameter(&customDeviceName);
  wifiManager.addParameter(&customMqttPassword);
  wifiManager.setConfigPortalTimeout(180);
  wifiManager.setConnectTimeout(30);

  String apName = "FloydFeeder-" + deviceChipId;
  Serial.println("Starting provisioning AP: " + apName);

  if (!wifiManager.autoConnect(apName.c_str())) {
    Serial.println("Provisioning timed out, restarting...");
    delay(3000);
    ESP.restart();
  }

  strncpy(savedSSID, WiFi.SSID().c_str(), 32);
  savedSSID[32] = '\0';
  strncpy(savedPassword, WiFi.psk().c_str(), 64);
  savedPassword[64] = '\0';
  strncpy(savedMqttBroker, "broker.hivemq.com", 63);
  savedMqttBroker[63] = '\0';
  mqttPassword = String(customMqttPassword.getValue());

  saveConfig();
  Serial.println("Provisioning complete. Restarting to connect via MQTT...");
  delay(1000);
  ESP.restart();
}

void configureMQTTClient() {
  mqttClientId = "floyd-" + deviceChipId;
  mqttClient.setWifiCredentials(savedSSID, savedPassword);
  mqttClient.setMqttServer(savedMqttBroker, "", "", 1883);
  mqttClient.setMqttClientName(mqttClientId.c_str());
  mqttClient.setKeepAlive(30);
  mqttClient.enableMQTTPersistence();
  mqttClient.enableLastWillMessage(topicStatus.c_str(), R"({"type":"status","data":{"connected":false}})", true);
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(savedSSID);

  WiFi.begin(savedSSID, savedPassword);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    ESP.wdtFeed();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    wifiReconnectAttempts = 0;
  } else {
    Serial.println();
    Serial.println("Failed to connect to WiFi! Will retry...");
  }
}

void checkWiFiConnection() {
  if (millis() - lastWiFiCheck >= WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected. Attempting reconnection...");

      if (wifiReconnectAttempts < MAX_WIFI_RECONNECT_ATTEMPTS) {
        wifiReconnectAttempts++;
        Serial.println("Reconnect attempt: " + String(wifiReconnectAttempts));

        WiFi.disconnect();
        delay(1000);
        ESP.wdtFeed();

        connectToWiFi();
      } else {
        Serial.println("Max WiFi reconnection attempts reached. Restarting ESP8266...");
        ESP.restart();
      }
    } else {
      wifiReconnectAttempts = 0;
    }
  }
}

// ============================================================
//  Motor Driving Primitives
// ============================================================

void setAugerMotor(int speed, bool forward) {
  speed = constrain(speed, 0, 1023);

  if (speed == 0) {
    digitalWrite(MOTOR_A_IN1, LOW);
    digitalWrite(MOTOR_A_IN2, LOW);
    analogWrite(MOTOR_A_ENA, 0);
  } else {
    analogWrite(MOTOR_A_ENA, speed);
    if (forward) {
      digitalWrite(MOTOR_A_IN1, HIGH);
      digitalWrite(MOTOR_A_IN2, LOW);
    } else {
      digitalWrite(MOTOR_A_IN1, LOW);
      digitalWrite(MOTOR_A_IN2, HIGH);
    }
  }
}

void setImpellerMotor(int speed) {
  speed = constrain(speed, 0, 1023);

  if (speed == 0) {
    digitalWrite(MOTOR_B_IN3, LOW);
    digitalWrite(MOTOR_B_IN4, LOW);
    analogWrite(MOTOR_B_ENB, 0);
  } else {
    analogWrite(MOTOR_B_ENB, speed);
    digitalWrite(MOTOR_B_IN3, HIGH);
    digitalWrite(MOTOR_B_IN4, LOW);
  }
}

void stopAllMotors() {
  analogWrite(MOTOR_A_ENA, 0);
  analogWrite(MOTOR_B_ENB, 0);
  digitalWrite(MOTOR_A_IN1, LOW);
  digitalWrite(MOTOR_A_IN2, LOW);
  digitalWrite(MOTOR_B_IN3, LOW);
  digitalWrite(MOTOR_B_IN4, LOW);
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

void startFeeding(int augerSpeed, int impellerSpeed, unsigned long preSpinMs, unsigned long feedMs, unsigned long postSpinMs) {
  preSpinMs = constrain(preSpinMs, 500, 5000);
  feedMs = constrain(feedMs, MIN_FEED_MS, MAX_FEED_MS);
  postSpinMs = constrain(postSpinMs, 500, 5000);
  augerSpeed = constrain(augerSpeed, 0, 1023);
  impellerSpeed = constrain(impellerSpeed, 0, 1023);

  motor.preSpinMs = preSpinMs;
  motor.feedMs = feedMs;
  motor.postSpinMs = postSpinMs;
  motor.augerSpeed = augerSpeed;
  motor.impellerSpeed = impellerSpeed;

  setImpellerMotor(impellerSpeed);
  setAugerMotor(0, true);

  motor.state = STATE_PRE_SPIN;
  motor.stateStartTime = millis();
}

void startJamClear(int speed, unsigned long duration) {
  speed = constrain(speed, 0, 1023);
  duration = constrain(duration, 500, 5000);

  motor.jamClearMs = duration;

  setImpellerMotor(0);
  setAugerMotor(speed, false);

  motor.state = STATE_JAM_CLEAR;
  motor.stateStartTime = millis();
}

void emergencyStop() {
  motor.state = STATE_STOPPING;
  motor.stateStartTime = millis();
}

// ============================================================
//  Volume-Based Food Level Calculation
// ============================================================

float frustumVolume(float h, float R, float r) {
  return (PI / 3.0) * h * (R*R + R*r + r*r);
}

float cylinderVolume(float h, float r) {
  return PI * r * r * h;
}

float computeTotalVolume() {
  float vFrustum = frustumVolume(frustumHeight, frustumTopRadius, frustumBottomRadius);
  float vCylinder = cylinderVolume(cylinderHeight, cylinderRadius);
  return vFrustum + vCylinder;
}

float computeCurrentVolume(float distanceCm) {
  float transitionCm = cylinderHeight;  // 10 inches in cm (25.4)
  float vFrustumFull = frustumVolume(frustumHeight, frustumTopRadius, frustumBottomRadius);

  if (distanceCm <= transitionCm) {
    // Case 1: d <= 10" — food in both cylinder AND frustum sections
    float cylinderFilledHeight = transitionCm - distanceCm;
    float vCylinderPartial = cylinderVolume(cylinderFilledHeight, cylinderRadius);
    return vCylinderPartial + vFrustumFull;
  } else {
    // Case 2: d > 10" — food only in frustum section (cylinder is empty)
    float frustumFilledHeight = distanceCm - transitionCm;
    if (frustumFilledHeight > frustumHeight) frustumFilledHeight = frustumHeight;

    float rAtLevel = frustumTopRadius -
                     (frustumFilledHeight / frustumHeight) *
                     (frustumTopRadius - frustumBottomRadius);

    return frustumVolume(frustumFilledHeight, frustumTopRadius, rAtLevel);
  }
}

float calculateFoodLevel(float distanceCm) {
  if (totalVolumeCm3 <= 0) return 0;
  float currentVol = computeCurrentVolume(distanceCm);
  float pct = (currentVol / totalVolumeCm3) * 100.0;
  return constrain(pct, 0, 100);
}

// ============================================================
//  Sensors
// ============================================================

float readUltrasonicDistance() {
  float validReadings[3];
  int validCount = 0;

  for (int i = 0; i < 3; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);

    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

    if (duration > 0) {
      float distance = (duration * 0.0343) / 2;

      if (distance >= 1.0 && distance <= 400.0) {
        validReadings[validCount] = distance;
        validCount++;
      }
    }

    delay(10);
    ESP.wdtFeed();
  }

  if (validCount == 0) {
    sensors.ultrasonicSensorConnected = false;
    return NAN;
  }

  sensors.ultrasonicSensorConnected = true;

  float sum = 0;
  for (int i = 0; i < validCount; i++) {
    sum += validReadings[i];
  }

  return sum / validCount;
}

SensorData readSensors() {
  ESP.wdtFeed();

  // Temperature
  if (sensors.temperatureSensorConnected) {
    temperatureSensor.requestTemperatures();
    sensors.temperature = temperatureSensor.getTempCByIndex(0);

    if (sensors.temperature == DEVICE_DISCONNECTED_C || sensors.temperature < -40 || sensors.temperature > 85) {
      Serial.println("Error: DS18B20 sensor disconnected or invalid reading");
      sensors.temperature = NAN;
      sensors.temperatureSensorConnected = false;
    }
  } else {
    sensors.temperature = NAN;
  }

  // Distance
  sensors.distance = readUltrasonicDistance();

  // Food level — volume-based calculation
  if (sensors.ultrasonicSensorConnected && !isnan(sensors.distance)) {
    sensors.foodLevelPercentage = calculateFoodLevel(sensors.distance);
  } else {
    sensors.foodLevelPercentage = 0;
  }

  Serial.println("--- Sensor Readings ---");
  if (!isnan(sensors.temperature)) {
    Serial.println("Temp: " + String(sensors.temperature, 1) + " C");
  } else {
    Serial.println("Temp: Error");
  }

  if (!isnan(sensors.distance)) {
    Serial.println("Distance: " + String(sensors.distance, 1) + " cm");
    Serial.println("Food: " + String(sensors.foodLevelPercentage, 1) + " %");
  } else {
    Serial.println("Distance: Error");
  }

  Serial.println("Motor: " + String(motor.state));
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("----------------------");

  SensorData data = sensors;
  return data;
}

// ============================================================
//  MQTT Messaging
// ============================================================

void broadcastResponse(JsonDocument& doc) {
  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

void broadcastSensorData() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");

  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    data["temperature"] = round(sensors.temperature * 10) / 10.0;
  }

  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    data["distance"] = round(sensors.distance * 10) / 10.0;
    data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }

  data["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  data["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;

  // Motor state
  data["motorState"] = motor.state == STATE_IDLE ? "idle" :
                        motor.state == STATE_PRE_SPIN ? "pre_spin" :
                        motor.state == STATE_FEEDING ? "feeding" :
                        motor.state == STATE_POST_SPIN ? "post_spin" :
                        motor.state == STATE_JAM_CLEAR ? "jam_clear" : "idle";
  data["augerSpeed"] = motor.augerSpeed;
  data["impellerSpeed"] = motor.impellerSpeed;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  if (mqttClient.isConnected()) {
    mqttClient.publish(topicTelemetry, output);
  }
}

void sendSensorData(uint8_t num) {
  (void)num;
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");

  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    data["temperature"] = round(sensors.temperature * 10) / 10.0;
  }

  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    data["distance"] = round(sensors.distance * 10) / 10.0;
    data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }

  data["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  data["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;

  data["motorState"] = motor.state == STATE_IDLE ? "idle" :
                        motor.state == STATE_PRE_SPIN ? "pre_spin" :
                        motor.state == STATE_FEEDING ? "feeding" :
                        motor.state == STATE_POST_SPIN ? "post_spin" :
                        motor.state == STATE_JAM_CLEAR ? "jam_clear" : "idle";
  data["augerSpeed"] = motor.augerSpeed;
  data["impellerSpeed"] = motor.impellerSpeed;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

void sendDeviceStatus(uint8_t num) {
  (void)num;
  StaticJsonDocument<512> doc;
  doc["type"] = "status";
  JsonObject data = doc.createNestedObject("data");
  data["connected"] = true;
  data["uptime"] = millis();
  data["freeHeap"] = ESP.getFreeHeap();
  data["wifiRssi"] = WiFi.RSSI();
  data["sensorInterval"] = sensorInterval;

  data["motorState"] = motor.state == STATE_IDLE ? "idle" :
                        motor.state == STATE_PRE_SPIN ? "pre_spin" :
                        motor.state == STATE_FEEDING ? "feeding" :
                        motor.state == STATE_POST_SPIN ? "post_spin" :
                        motor.state == STATE_JAM_CLEAR ? "jam_clear" : "idle";

  JsonObject config = data.createNestedObject("feederConfig");
  config["cylinderRadius"] = cylinderRadius;
  config["cylinderHeight"] = cylinderHeight;
  config["frustumTopRadius"] = frustumTopRadius;
  config["frustumBottomRadius"] = frustumBottomRadius;
  config["frustumHeight"] = frustumHeight;
  config["totalVolumeCm3"] = totalVolumeCm3;
  config["sensorInterval"] = sensorInterval;
  config["defaultPreSpinMs"] = DEFAULT_PRE_SPIN_MS;
  config["defaultPostSpinMs"] = DEFAULT_POST_SPIN_MS;
  config["defaultFeedMs"] = DEFAULT_FEED_MS;

  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    data["temperature"] = round(sensors.temperature * 10) / 10.0;
  }

  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    data["distance"] = round(sensors.distance * 10) / 10.0;
    data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }

  data["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  data["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  if (mqttClient.isConnected()) {
    mqttClient.publish(topicStatus, output, true);
  }
}

void sendFeedingComplete() {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  JsonObject data = doc.createNestedObject("data");
  data["action"] = "feed_complete";
  data["success"] = true;
  data["motorState"] = "idle";
  doc["timestamp"] = millis();
  broadcastResponse(doc);
}

void sendJamClearComplete() {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  JsonObject data = doc.createNestedObject("data");
  data["action"] = "jam_clear_complete";
  data["success"] = true;
  data["motorState"] = "idle";
  doc["timestamp"] = millis();
  broadcastResponse(doc);
}

void sendError(uint8_t num, String errorMessage) {
  (void)num;
  StaticJsonDocument<256> doc;
  doc["type"] = "error";
  doc["data"]["message"] = errorMessage;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

void handlePing(uint8_t num) {
  (void)num;
  StaticJsonDocument<128> doc;
  doc["type"] = "status";
  doc["data"]["pong"] = true;
  doc["data"]["uptime"] = millis();
  doc["data"]["freeHeap"] = ESP.getFreeHeap();
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  pendingResponse = output;
}

// ============================================================
//  MQTT Command Handler
// ============================================================

void handleMQTTMessage(String message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    sendError(0, "Invalid JSON");
    return;
  }

  String action = doc["action"] | "";

  if (action == "start_feed") {
    JsonObject params = doc["parameters"].as<JsonObject>();
    int augerSpeed = params["augerSpeed"] | doc["augerSpeed"] | DEFAULT_AUGER_SPEED;
    int impellerSpeed = params["impellerSpeed"] | doc["impellerSpeed"] | DEFAULT_IMPELLER_SPEED;
    unsigned long preSpinMs = params["preSpinMs"] | doc["preSpinMs"] | DEFAULT_PRE_SPIN_MS;
    unsigned long feedMs = params["feedMs"] | doc["feedMs"] | DEFAULT_FEED_MS;
    unsigned long postSpinMs = params["postSpinMs"] | doc["postSpinMs"] | DEFAULT_POST_SPIN_MS;

    startFeeding(augerSpeed, impellerSpeed, preSpinMs, feedMs, postSpinMs);

    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "start_feed";
    data["success"] = true;
    data["motorState"] = "pre_spin";
    response["timestamp"] = millis();
    broadcastResponse(response);

  } else if (action == "stop_feed") {
    emergencyStop();

    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "stop_feed";
    data["success"] = true;
    data["motorState"] = "idle";
    response["timestamp"] = millis();
    broadcastResponse(response);

  } else if (action == "clear_jam") {
    JsonObject params = doc["parameters"].as<JsonObject>();
    int speed = params["speed"] | doc["speed"] | DEFAULT_AUGER_SPEED;
    unsigned long duration = params["duration"] | doc["duration"] | DEFAULT_JAM_CLEAR_MS;

    startJamClear(speed, duration);

    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "clear_jam";
    data["success"] = true;
    data["motorState"] = "jam_clear";
    response["timestamp"] = millis();
    broadcastResponse(response);

  } else if (action == "get_sensors") {
    readSensors();
    sendSensorData(0);

  } else if (action == "set_sensor_interval") {
    unsigned long interval = doc["parameters"]["interval"] | sensorInterval;
    sensorInterval = constrain(interval, MIN_SENSOR_INTERVAL, MAX_SENSOR_INTERVAL);
    saveConfig();

    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "set_sensor_interval";
    data["success"] = true;
    data["interval"] = sensorInterval;
    response["timestamp"] = millis();
    broadcastResponse(response);

  } else if (action == "set_config") {
    if (doc.containsKey("parameters")) {
      JsonObject params = doc["parameters"];
      if (params.containsKey("cylinderRadius"))      cylinderRadius      = params["cylinderRadius"];
      if (params.containsKey("cylinderHeight"))      cylinderHeight      = params["cylinderHeight"];
      if (params.containsKey("frustumTopRadius"))    frustumTopRadius    = params["frustumTopRadius"];
      if (params.containsKey("frustumBottomRadius")) frustumBottomRadius = params["frustumBottomRadius"];
      if (params.containsKey("frustumHeight"))       frustumHeight       = params["frustumHeight"];

      totalVolumeCm3 = computeTotalVolume();
      saveConfig();

      StaticJsonDocument<256> response;
      response["type"] = "control_response";
      JsonObject data = response.createNestedObject("data");
      data["action"] = "set_config";
      data["success"] = true;
      response["timestamp"] = millis();
      broadcastResponse(response);
    }

  } else if (action == "ping") {
    handlePing(0);

  } else {
    sendError(0, "Unknown action: " + action);
  }
}

void onConnectionEstablished() {
  Serial.println("MQTT connected. Subscribing to command topic...");

  mqttClient.subscribe(topicCommand, [](const String &topic, const String &payload) {
    (void)topic;
    pendingCommandPayload = payload;
    pendingCommand = true;
  });

  sendDeviceStatus(0);
}

// ============================================================
//  Setup & Loop
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println("\n=== Floyd Fish Feeder v2 — L298N Motor Driver ===");
  Serial.println("Pin Layout:");
  Serial.println("  L298N Auger: D5(ENA) D6(IN1) D7(IN2)");
  Serial.println("  L298N Impeller: D3(ENB) D8(IN3) D0(IN4)");
  Serial.println("  DS18B20 Temp: D4 (GPIO2)");
  Serial.println("  Ultrasonic TRIG: D1 (GPIO5)");
  Serial.println("  Ultrasonic ECHO: D2 (GPIO4)");
  Serial.println("========================================\n");

  // Initialize motor driver pins
  pinMode(MOTOR_A_ENA, OUTPUT);
  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_ENB, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);
  stopAllMotors();

  // Initialize ultrasonic pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // Initialize DS18B20
  temperatureSensor.begin();

  int deviceCount = temperatureSensor.getDeviceCount();
  Serial.println("Found " + String(deviceCount) + " DS18B20 device(s)");

  if (deviceCount == 0) {
    Serial.println("Warning: No DS18B20 temperature sensor found!");
    sensors.temperatureSensorConnected = false;
  } else {
    sensors.temperatureSensorConnected = true;
    Serial.println("DS18B20 temperature sensor initialized successfully");
  }

  sensors.ultrasonicSensorConnected = true;
  Serial.println("HC-SR04 ultrasonic sensor initialized");

  setupMQTTTopics();

  bool provisioned = loadConfig();

  // Compute total volume
  totalVolumeCm3 = computeTotalVolume();

  if (!provisioned || savedSSID[0] == '\0') {
    Serial.println("No saved WiFi credentials. Starting provisioning mode...");
    startProvisioningMode();
  }

  configureMQTTClient();

  Serial.println("Setup complete! Ready for MQTT.");
  Serial.println("Device ID: " + deviceChipId);
  Serial.println("MQTT client ID: " + mqttClientId);
  Serial.println("MQTT broker: " + String(savedMqttBroker));
  Serial.println("Total volume: " + String(totalVolumeCm3) + " cm3");
}

void loop() {
  ESP.wdtFeed();

  // EspMQTTClient manages WiFi and MQTT reconnects from its loop.
  mqttClient.loop();

  if (pendingCommand) {
    pendingCommand = false;
    handleMQTTMessage(pendingCommandPayload);
    pendingCommandPayload = "";
  }

  if (pendingResponse.length() > 0 && mqttClient.isConnected()) {
    mqttClient.publish(topicResponse, pendingResponse);
    pendingResponse = "";
  }

  // Update motor state machine
  updateMotorState();

  // Read sensors on interval
  unsigned long now = millis();
  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;
    readSensors();
    broadcastSensorData();
  }

  delay(10);
}
