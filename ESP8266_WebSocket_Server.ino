#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Stepper.h>
#include <EEPROM.h>

#ifndef WIFI_SSID
#define WIFI_SSID "CPUGAD Co-working Space"
#define WIFI_PASSWORD "**CPUExcel1905!"
#endif

const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;

WebSocketsServer webSocket = WebSocketsServer(81);

#define ONE_WIRE_BUS D4  
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature temperatureSensor(&oneWire);

#define TRIG_PIN D1      
#define ECHO_PIN D2      
#define RELAY_PIN D0         

#define STEPPER_IN1 D5    
#define STEPPER_IN2 D6   
#define STEPPER_IN3 D7   
#define STEPPER_IN4 D8   

const int STEPS_PER_REV = 2048;
const int HALF_REV = STEPS_PER_REV / 2;
const int STEPS_PER_MOVE = 100; 
Stepper stepperMotor(STEPS_PER_REV, STEPPER_IN1, STEPPER_IN3, STEPPER_IN2, STEPPER_IN4);

bool relayState = false;
bool motorOpened = false;
bool stepperMoving = false;
int stepperStepsRemaining = 0;
bool stepperDirection = true; 

unsigned long lastSensorRead = 0;
unsigned long sensorInterval = 5000; 
unsigned long lastHeartbeat = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastStepperMove = 0;

unsigned long wifiReconnectAttempts = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000; 
const unsigned long MAX_WIFI_RECONNECT_ATTEMPTS = 5;

const float FEEDER_HEIGHT = 20.0;    
const float MIN_DISTANCE = 3.0;      
const float MAX_DISTANCE = 18.0;     

struct SensorData {
  float temperature;
  bool temperatureSensorConnected;
  float distance;
  float foodLevelPercentage;
  bool ultrasonicSensorConnected;
} sensors;

void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n=== ESP8266 Fish Feeder WebSocket Server ===");
  Serial.println("Pin Layout:");
  Serial.println("  DS18B20 Temp: D4 (GPIO2)");
  Serial.println("  Ultrasonic TRIG: D1 (GPIO5)");
  Serial.println("  Ultrasonic ECHO: D2 (GPIO4)");
  Serial.println("  Relay: D0 (GPIO16)");
  Serial.println("  Stepper: D5,D6,D7,D8 (GPIO14,12,13,15)");
  Serial.println("========================================\n");
  
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
  
  EEPROM.begin(512);
  
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
  Serial.println("✅ Ultrasonic sensor on dedicated pins (no conflicts)");
  
  connectToWiFi();
  
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    
    Serial.println("Setup complete! Ready for connections.");
    Serial.println("Connect your app to: ws://" + WiFi.localIP().toString() + ":81");
    Serial.println("Feeder Configuration:");
    Serial.println("- Total Height: " + String(FEEDER_HEIGHT) + " cm");
    Serial.println("- Min Distance (Full): " + String(MIN_DISTANCE) + " cm");
    Serial.println("- Max Distance (Empty): " + String(MAX_DISTANCE) + " cm");
  }
}

void loop() {
  ESP.wdtFeed();
  
  checkWiFiConnection();
  
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }
  
  handleStepperMotor();
  
  if (!stepperMoving && millis() - lastSensorRead >= sensorInterval) {
    readSensors();
    broadcastSensorData();
    lastSensorRead = millis();
  }
  
  if (millis() - lastHeartbeat > 60000) { 
    lastHeartbeat = millis();
  }
  
  delay(5);
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
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
    Serial.println("Failed to connect to WiFi!");
    Serial.println("Device will continue trying to reconnect...");
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

void handleStepperMotor() {
  if (stepperMoving && millis() - lastStepperMove >= 10) { 
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
      
      Serial.println("Stepper movement completed. Motor " + 
                    String(motorOpened ? "OPENED" : "CLOSED"));
        
      broadcastSensorData();
    }
  }
}

void startStepperMovement(bool direction) {
  if (stepperMoving) {
    Serial.println("Stepper already moving, ignoring command");
    return;
  }
  
  stepperDirection = direction;
  stepperStepsRemaining = HALF_REV;
  stepperMoving = true;
  
  Serial.println("Starting stepper movement: " + 
                String(direction ? "OPENING" : "CLOSING"));
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      
      sendDeviceStatus(num);
      break;
    }
    
    case WStype_TEXT:
      Serial.printf("[%u] Received: %s\n", num, payload);
      handleWebSocketMessage(num, (char*)payload);
      break;
      
    case WStype_BIN:
      Serial.printf("[%u] Received binary data\n", num);
      break;
      
    default:
      break;
  }
}

void handleWebSocketMessage(uint8_t num, const char* message) {
  StaticJsonDocument<256> doc; 
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("Failed to parse JSON message: " + String(error.c_str()));
    sendError(num, "Invalid JSON format");
    return;
  }
  
  String action = doc["action"];
  Serial.println("Action: " + action);
  
  if (action == "toggle_relay") {
    handleRelayToggle(num);
  }
  else if (action == "get_sensors") {
    readSensors();
    sendSensorData(num);
  }
  else if (action == "set_sensor_interval") {
    int interval = doc["parameters"]["interval"];
    setSensorInterval(num, interval);
  }
  else if (action == "ping") {
    handlePing(num);
  }
  else {
    sendError(num, "Unknown action: " + action);
  }
}

void handleRelayToggle(uint8_t num) {
  relayState = !relayState;
  digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
  
  Serial.println("Relay toggled to: " + String(relayState ? "ON" : "OFF"));
  
  if (relayState && !motorOpened && !stepperMoving) {
    startStepperMovement(true); 
  } else if (!relayState && motorOpened && !stepperMoving) {
    startStepperMovement(false); 
  }
  
  StaticJsonDocument<256> response;
  response["type"] = "control_response";
  response["data"]["relayState"] = relayState;
  response["data"]["motorOpened"] = motorOpened;
  response["data"]["action"] = "toggle_relay";
  response["data"]["success"] = true;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void setSensorInterval(uint8_t num, int interval) {
  if (interval >= 1000 && interval <= 60000) { 
    sensorInterval = interval;
    Serial.println("Sensor interval set to: " + String(interval) + "ms");
    
    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    response["data"]["sensorInterval"] = interval;
    response["data"]["action"] = "set_sensor_interval";
    response["data"]["success"] = true;
    response["timestamp"] = millis();
    
    String responseStr;
    serializeJson(response, responseStr);
    webSocket.sendTXT(num, responseStr);
  } else {
    sendError(num, "Invalid interval. Must be between 1000-60000ms");
  }
}

void handlePing(uint8_t num) {
  lastHeartbeat = millis();
  
  StaticJsonDocument<128> response;
  response["type"] = "status";
  response["data"]["pong"] = true;
  response["data"]["uptime"] = millis();
  response["data"]["freeHeap"] = ESP.getFreeHeap();
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
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

float calculateFoodLevel(float distance) {
  if (isnan(distance)) {
    return NAN;
  }
  
  distance = constrain(distance, MIN_DISTANCE, MAX_DISTANCE);
  
  float percentage = ((MAX_DISTANCE - distance) / (MAX_DISTANCE - MIN_DISTANCE)) * 100;
  
  percentage = constrain(percentage, 0, 100);
  
  return percentage;
}

void readSensors() {
  ESP.wdtFeed(); 
  
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
  
  sensors.distance = readUltrasonicDistance();
  sensors.foodLevelPercentage = calculateFoodLevel(sensors.distance);
  
  Serial.println("--- Sensor Readings ---");
  if (!isnan(sensors.temperature)) {
    Serial.println("Temp: " + String(sensors.temperature, 1) + "°C");
  } else {
    Serial.println("Temp: Error");
  }
  
  if (!isnan(sensors.distance)) {
    Serial.println("Distance: " + String(sensors.distance, 1) + "cm");
    Serial.println("Food: " + String(sensors.foodLevelPercentage, 1) + "%");
  } else {
    Serial.println("Distance: Error");
  }
  
  Serial.println("Relay: " + String(relayState ? "ON" : "OFF") + 
                " | Motor: " + String(motorOpened ? "OPEN" : "CLOSED"));
  Serial.println("Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  Serial.println("----------------------");
}

void sendSensorData(uint8_t num) {
  StaticJsonDocument<512> response; 
  response["type"] = "sensor_data";
  
  JsonObject data = response.createNestedObject("data");
  
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
  
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void broadcastSensorData() {
  StaticJsonDocument<512> response;
  response["type"] = "sensor_data";
  
  JsonObject data = response.createNestedObject("data");
  
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
  
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.broadcastTXT(responseStr);
}

void sendDeviceStatus(uint8_t num) {
  readSensors(); 
  
  StaticJsonDocument<512> response;
  response["type"] = "status";
  
  JsonObject data = response.createNestedObject("data");
  data["connected"] = true;
  data["relayState"] = relayState;
  data["motorOpened"] = motorOpened;
  data["stepperMoving"] = stepperMoving;
  data["sensorInterval"] = sensorInterval;
  data["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  data["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;
  data["sensorConnected"] = sensors.temperatureSensorConnected;
  data["freeHeap"] = ESP.getFreeHeap();
  data["uptime"] = millis();
  
  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    data["temperature"] = round(sensors.temperature * 10) / 10.0;
  }
  
  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    data["distance"] = round(sensors.distance * 10) / 10.0;
    data["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }
  
  JsonObject config = data.createNestedObject("feederConfig");
  config["height"] = FEEDER_HEIGHT;
  config["minDistance"] = MIN_DISTANCE;
  config["maxDistance"] = MAX_DISTANCE;
  
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void sendError(uint8_t num, String errorMessage) {
  StaticJsonDocument<256> response;
  response["type"] = "error";
  response["data"]["message"] = errorMessage;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
} 