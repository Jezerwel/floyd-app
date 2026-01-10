/**
 * Floyd Fish Feeder - ESP8266 MQTT Firmware
 * Cloud-connected via MQTT with TLS support
 * Maintains local WebSocket fallback for direct connections
 */

#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Stepper.h>
#include <EEPROM.h>

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

// WiFi Configuration
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#endif

// MQTT Configuration
#define MQTT_BROKER "54ec80585d014da3b9bb496cffb611a9.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883
#define MQTT_USERNAME "FloydApp"
#define MQTT_PASSWORD "FloydApp@123"
#define DEVICE_ID "floyd_001"

// MQTT Topic Prefix
#define MQTT_TOPIC_PREFIX "floyd"

#define ENABLE_MQTT true
#define ENABLE_LOCAL_WEBSOCKET true

// ============================================
// PIN DEFINITIONS
// ============================================

#define ONE_WIRE_BUS D4      // DS18B20 Temperature Sensor
#define TRIG_PIN D1          // Ultrasonic Trigger
#define ECHO_PIN D2          // Ultrasonic Echo
#define RELAY_PIN D0         // Relay Control

// Stepper Motor Pins
#define STEPPER_IN1 D5
#define STEPPER_IN2 D6
#define STEPPER_IN3 D7
#define STEPPER_IN4 D8

// ============================================
// CONSTANTS
// ============================================

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

const char* mqtt_broker = MQTT_BROKER;
const int mqtt_port = MQTT_PORT;
const char* mqtt_username = MQTT_USERNAME;
const char* mqtt_password = MQTT_PASSWORD;
const char* device_id = DEVICE_ID;

// MQTT Topics
String topic_sensors;
String topic_status;
String topic_commands;
String topic_response;

// Stepper Configuration
const int STEPS_PER_REV = 2048;
const int HALF_REV = STEPS_PER_REV / 2;

// Feeder Configuration
const float FEEDER_HEIGHT = 20.0;
const float MIN_DISTANCE = 3.0;
const float MAX_DISTANCE = 18.0;

// Timing
const unsigned long SENSOR_INTERVAL = 5000;
const unsigned long MQTT_RECONNECT_INTERVAL = 5000;
const unsigned long WIFI_CHECK_INTERVAL = 30000;

// ============================================
// GLOBAL OBJECTS
// ============================================

WiFiClientSecure wifiClientSecure;
PubSubClient mqttClient(wifiClientSecure);
WebSocketsServer webSocket = WebSocketsServer(81);

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature temperatureSensor(&oneWire);
Stepper stepperMotor(STEPS_PER_REV, STEPPER_IN1, STEPPER_IN3, STEPPER_IN2, STEPPER_IN4);

// ============================================
// STATE VARIABLES
// ============================================

bool relayState = false;
bool motorOpened = false;
bool stepperMoving = false;
int stepperStepsRemaining = 0;
bool stepperDirection = true;

unsigned long lastSensorRead = 0;
unsigned long lastMqttReconnect = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastStepperMove = 0;
unsigned long wifiReconnectAttempts = 0;

struct SensorData {
  float temperature;
  bool temperatureSensorConnected;
  float distance;
  float foodLevelPercentage;
  bool ultrasonicSensorConnected;
} sensors;

// ============================================
// SETUP
// ============================================

void setup() {
  Serial.begin(115200);
  delay(100);

  printBanner();
  initializePins();
  initializeSensors();
  initializeTopics();

  // Connect to WiFi
  connectToWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    // Setup MQTT with TLS
    if (ENABLE_MQTT) {
      setupMQTT();
    }

    // Setup local WebSocket server
    if (ENABLE_LOCAL_WEBSOCKET) {
      webSocket.begin();
      webSocket.onEvent(webSocketEvent);
      Serial.println("Local WebSocket server started on port 81");
    }
  }

  Serial.println("\n=== Setup Complete ===");
  Serial.println("MQTT: " + String(ENABLE_MQTT ? "Enabled" : "Disabled"));
  Serial.println("Local WS: " + String(ENABLE_LOCAL_WEBSOCKET ? "Enabled" : "Disabled"));
}

void printBanner() {
  Serial.println("\n============================================");
  Serial.println("   Floyd Fish Feeder - MQTT Firmware v2.0");
  Serial.println("============================================");
  Serial.println("Device ID: " + String(device_id));
  Serial.println("Pin Layout:");
  Serial.println("  DS18B20 Temp: D4 (GPIO2)");
  Serial.println("  Ultrasonic: D1/D2 (GPIO5/4)");
  Serial.println("  Relay: D0 (GPIO16)");
  Serial.println("  Stepper: D5-D8");
  Serial.println("============================================\n");
}

void initializePins() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(STEPPER_IN1, OUTPUT);
  pinMode(STEPPER_IN2, OUTPUT);
  pinMode(STEPPER_IN3, OUTPUT);
  pinMode(STEPPER_IN4, OUTPUT);

  digitalWrite(STEPPER_IN1, LOW);
  digitalWrite(STEPPER_IN2, LOW);
  digitalWrite(STEPPER_IN3, LOW);
  digitalWrite(STEPPER_IN4, LOW);

  stepperMotor.setSpeed(10);
}

void initializeSensors() {
  temperatureSensor.begin();

  int deviceCount = temperatureSensor.getDeviceCount();
  Serial.println("Found " + String(deviceCount) + " DS18B20 device(s)");

  sensors.temperatureSensorConnected = (deviceCount > 0);
  sensors.ultrasonicSensorConnected = true;

  if (sensors.temperatureSensorConnected) {
    Serial.println("✓ DS18B20 temperature sensor initialized");
  } else {
    Serial.println("✗ No DS18B20 temperature sensor found");
  }
}

void initializeTopics() {
  String prefix = String(MQTT_TOPIC_PREFIX) + "/" + String(device_id);
  topic_sensors = prefix + "/sensors";
  topic_status = prefix + "/status";
  topic_commands = prefix + "/commands";
  topic_response = prefix + "/response";

  Serial.println("MQTT Topics:");
  Serial.println("  Sensors: " + topic_sensors);
  Serial.println("  Commands: " + topic_commands);
}

// ============================================
// WIFI FUNCTIONS
// ============================================

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    ESP.wdtFeed();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi connected!");
    Serial.println("  IP: " + WiFi.localIP().toString());
    Serial.println("  RSSI: " + String(WiFi.RSSI()) + " dBm");
    wifiReconnectAttempts = 0;
  } else {
    Serial.println("\n✗ WiFi connection failed!");
  }
}

void checkWiFiConnection() {
  if (millis() - lastWiFiCheck < WIFI_CHECK_INTERVAL) return;
  lastWiFiCheck = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    wifiReconnectAttempts++;

    if (wifiReconnectAttempts > 5) {
      Serial.println("Max WiFi reconnect attempts. Restarting...");
      ESP.restart();
    }

    WiFi.disconnect();
    delay(1000);
    connectToWiFi();
  } else {
    wifiReconnectAttempts = 0;
  }
}

// ============================================
// MQTT FUNCTIONS
// ============================================

void setupMQTT() {
  // Use insecure mode for testing (accepts any certificate)
  // For production, load proper CA certificate
  wifiClientSecure.setInsecure();

  mqttClient.setServer(mqtt_broker, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);

  Serial.println("MQTT configured for: " + String(mqtt_broker));
}

void connectMQTT() {
  if (mqttClient.connected()) return;
  if (millis() - lastMqttReconnect < MQTT_RECONNECT_INTERVAL) return;

  lastMqttReconnect = millis();
  Serial.print("Connecting to MQTT broker... ");

  String clientId = "floyd-" + String(device_id) + "-" + String(random(1000));

  if (mqttClient.connect(clientId.c_str(), mqtt_username, mqtt_password)) {
    Serial.println("connected!");

    // Subscribe to commands topic
    mqttClient.subscribe(topic_commands.c_str());
    Serial.println("Subscribed to: " + topic_commands);

    // Publish online status
    publishStatus(true);
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.println("MQTT received [" + String(topic) + "]: " + message);

  if (String(topic) == topic_commands) {
    handleMQTTCommand(message);
  }
}

void handleMQTTCommand(String message) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.println("Failed to parse MQTT command");
    publishError("Invalid JSON format");
    return;
  }

  String action = doc["action"];
  Serial.println("MQTT Action: " + action);

  if (action == "toggle_relay") {
    handleRelayToggle();
  } else if (action == "get_sensors") {
    readSensors();
    publishSensorData();
  } else if (action == "set_sensor_interval") {
    // Not implemented for MQTT mode
  } else if (action == "ping") {
    publishPong();
  } else {
    publishError("Unknown action: " + action);
  }
}

void publishSensorData() {
  if (!mqttClient.connected()) return;

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
  data["sensorConnected"] = sensors.temperatureSensorConnected;
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;
  data["stepperMoving"] = stepperMoving;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topic_sensors.c_str(), output.c_str());
}

void publishStatus(bool online) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<256> doc;
  doc["type"] = "status";

  JsonObject data = doc.createNestedObject("data");
  data["online"] = online;
  data["deviceId"] = device_id;
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;
  data["freeHeap"] = ESP.getFreeHeap();
  data["uptime"] = millis();

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topic_status.c_str(), output.c_str());
}

void publishControlResponse(String action, bool success) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";

  JsonObject data = doc.createNestedObject("data");
  data["action"] = action;
  data["success"] = success;
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topic_response.c_str(), output.c_str());
}

void publishPong() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<128> doc;
  doc["type"] = "status";

  JsonObject data = doc.createNestedObject("data");
  data["pong"] = true;
  data["uptime"] = millis();
  data["freeHeap"] = ESP.getFreeHeap();

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topic_response.c_str(), output.c_str());
}

void publishError(String errorMessage) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<256> doc;
  doc["type"] = "error";
  doc["data"]["message"] = errorMessage;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topic_response.c_str(), output.c_str());
}

// ============================================
// WEBSOCKET FUNCTIONS (Local Fallback)
// ============================================

void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client %u disconnected\n", num);
      break;

    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WS] Client %u connected from %s\n", num, ip.toString().c_str());
      sendDeviceStatus(num);
      break;
    }

    case WStype_TEXT:
      Serial.printf("[WS] Received from %u: %s\n", num, payload);
      handleWebSocketMessage(num, (char*)payload);
      break;

    default:
      break;
  }
}

void handleWebSocketMessage(uint8_t num, const char* message) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    sendWSError(num, "Invalid JSON format");
    return;
  }

  String action = doc["action"];

  if (action == "toggle_relay") {
    handleRelayToggle();
    sendWSControlResponse(num, "toggle_relay", true);
  } else if (action == "get_sensors") {
    readSensors();
    sendWSSensorData(num);
  } else if (action == "ping") {
    sendWSPong(num);
  } else {
    sendWSError(num, "Unknown action");
  }
}

void sendWSSensorData(uint8_t num) {
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
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}

void sendDeviceStatus(uint8_t num) {
  readSensors();

  StaticJsonDocument<512> doc;
  doc["type"] = "status";

  JsonObject data = doc.createNestedObject("data");
  data["connected"] = true;
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;
  data["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  data["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;
  data["freeHeap"] = ESP.getFreeHeap();

  if (!isnan(sensors.temperature)) {
    data["temperature"] = round(sensors.temperature * 10) / 10.0;
  }
  if (!isnan(sensors.distance)) {
    data["distance"] = round(sensors.distance * 10) / 10.0;
    data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }

  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}

void sendWSControlResponse(uint8_t num, String action, bool success) {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  doc["data"]["action"] = action;
  doc["data"]["success"] = success;
  doc["data"]["relayState"] = relayState;
  doc["data"]["motorOpened"] = motorOpened;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}

void sendWSPong(uint8_t num) {
  StaticJsonDocument<128> doc;
  doc["type"] = "status";
  doc["data"]["pong"] = true;
  doc["data"]["uptime"] = millis();
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}

void sendWSError(uint8_t num, String message) {
  StaticJsonDocument<256> doc;
  doc["type"] = "error";
  doc["data"]["message"] = message;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}

void broadcastSensorData() {
  // Broadcast via WebSocket
  if (ENABLE_LOCAL_WEBSOCKET) {
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
    data["relayState"] = relayState;
    data["motorOpened"] = motorOpened;

    doc["timestamp"] = millis();

    String output;
    serializeJson(doc, output);
    webSocket.broadcastTXT(output);
  }

  // Publish via MQTT
  if (ENABLE_MQTT) {
    publishSensorData();
  }
}

// ============================================
// DEVICE CONTROL FUNCTIONS
// ============================================

void handleRelayToggle() {
  relayState = !relayState;
  digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);

  Serial.println("Relay toggled to: " + String(relayState ? "ON" : "OFF"));

  if (relayState && !motorOpened && !stepperMoving) {
    startStepperMovement(true);
  } else if (!relayState && motorOpened && !stepperMoving) {
    startStepperMovement(false);
  }

  // Publish response via MQTT
  if (ENABLE_MQTT) {
    publishControlResponse("toggle_relay", true);
  }
}

void startStepperMovement(bool direction) {
  if (stepperMoving) return;

  stepperDirection = direction;
  stepperStepsRemaining = HALF_REV;
  stepperMoving = true;

  Serial.println("Stepper: " + String(direction ? "OPENING" : "CLOSING"));
}

void handleStepperMotor() {
  if (!stepperMoving) return;
  if (millis() - lastStepperMove < 10) return;

  lastStepperMove = millis();

  if (stepperStepsRemaining > 0) {
    stepperMotor.step(stepperDirection ? 1 : -1);
    stepperStepsRemaining--;

    if (stepperStepsRemaining % 50 == 0) {
      ESP.wdtFeed();
    }
  } else {
    stepperMoving = false;
    motorOpened = stepperDirection;
    Serial.println("Stepper completed. Motor: " + String(motorOpened ? "OPENED" : "CLOSED"));
    broadcastSensorData();
  }
}

// ============================================
// SENSOR FUNCTIONS
// ============================================

void readSensors() {
  ESP.wdtFeed();

  // Read temperature
  if (sensors.temperatureSensorConnected) {
    temperatureSensor.requestTemperatures();
    sensors.temperature = temperatureSensor.getTempCByIndex(0);

    if (sensors.temperature == DEVICE_DISCONNECTED_C ||
        sensors.temperature < -40 || sensors.temperature > 85) {
      sensors.temperature = NAN;
      sensors.temperatureSensorConnected = false;
    }
  } else {
    sensors.temperature = NAN;
  }

  // Read distance
  sensors.distance = readUltrasonicDistance();
  sensors.foodLevelPercentage = calculateFoodLevel(sensors.distance);

  // Debug output
  Serial.println("--- Sensors ---");
  if (!isnan(sensors.temperature)) {
    Serial.println("Temp: " + String(sensors.temperature, 1) + "°C");
  }
  if (!isnan(sensors.distance)) {
    Serial.println("Distance: " + String(sensors.distance, 1) + "cm");
    Serial.println("Food: " + String(sensors.foodLevelPercentage, 1) + "%");
  }
  Serial.println("Heap: " + String(ESP.getFreeHeap()));
}

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
        validReadings[validCount++] = distance;
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

float calculateFoodLevel(float distance) {
  if (isnan(distance)) return NAN;

  distance = constrain(distance, MIN_DISTANCE, MAX_DISTANCE);
  float percentage = ((MAX_DISTANCE - distance) / (MAX_DISTANCE - MIN_DISTANCE)) * 100;
  return constrain(percentage, 0, 100);
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
  ESP.wdtFeed();

  // Check WiFi connection
  checkWiFiConnection();

  if (WiFi.status() != WL_CONNECTED) {
    delay(100);
    return;
  }

  // Handle MQTT
  if (ENABLE_MQTT) {
    if (!mqttClient.connected()) {
      connectMQTT();
    }
    mqttClient.loop();
  }

  // Handle local WebSocket
  if (ENABLE_LOCAL_WEBSOCKET) {
    webSocket.loop();
  }

  // Handle stepper motor
  handleStepperMotor();

  // Periodic sensor reading and broadcast
  if (!stepperMoving && millis() - lastSensorRead >= SENSOR_INTERVAL) {
    readSensors();
    broadcastSensorData();
    lastSensorRead = millis();
  }

  delay(5);
}
