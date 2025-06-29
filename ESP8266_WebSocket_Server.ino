#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// WebSocket Server Configuration
WebSocketsServer webSocket = WebSocketsServer(81);

// DS18B20 Temperature Sensor Configuration
#define ONE_WIRE_BUS D4  // Data wire is connected to digital pin D4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature temperatureSensor(&oneWire);

// HC-SR04 Ultrasonic Sensor Configuration
#define TRIG_PIN D5      // Trigger pin for HC-SR04
#define ECHO_PIN D6      // Echo pin for HC-SR04

// GPIO Pin Configuration
#define LED_PIN D1        // Built-in LED or external LED
#define RELAY_PIN D2      // Relay control pin

// Device State Variables
bool ledState = false;
bool relayState = false;
unsigned long lastSensorRead = 0;
unsigned long sensorInterval = 5000; // Default 5 seconds
unsigned long lastHeartbeat = 0;

// Food Level Configuration (adjust these values based on your feeder dimensions)
const float FEEDER_HEIGHT = 20.0;    // Total height of feeder in cm
const float MIN_DISTANCE = 3.0;      // Minimum distance when feeder is full (sensor to food surface) in cm
const float MAX_DISTANCE = 18.0;     // Maximum distance when feeder is empty in cm

// Sensor Data Structure
struct SensorData {
  float temperature;
  bool temperatureSensorConnected;
  float distance;
  float foodLevelPercentage;
  bool ultrasonicSensorConnected;
} sensors;

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== ESP8266 WebSocket Server with DS18B20 & HC-SR04 ===");
  
  // Initialize GPIO pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Initialize DS18B20 temperature sensor
  temperatureSensor.begin();
  
  // Check if DS18B20 sensor is connected
  int deviceCount = temperatureSensor.getDeviceCount();
  Serial.println("Found " + String(deviceCount) + " DS18B20 device(s)");
  
  if (deviceCount == 0) {
    Serial.println("Warning: No DS18B20 temperature sensor found!");
    sensors.temperatureSensorConnected = false;
  } else {
    sensors.temperatureSensorConnected = true;
    Serial.println("DS18B20 temperature sensor initialized successfully");
  }
  
  // Initialize HC-SR04 ultrasonic sensor
  digitalWrite(TRIG_PIN, LOW);
  sensors.ultrasonicSensorConnected = true;
  Serial.println("HC-SR04 ultrasonic sensor initialized");
  
  // Set initial states
  digitalWrite(LED_PIN, LOW);
  digitalWrite(RELAY_PIN, LOW);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("WebSocket server started on port: 81");
  Serial.println();
  
  // Initialize WebSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  
  Serial.println("Setup complete! Ready for connections.");
  Serial.println("Connect your app to: ws://" + WiFi.localIP().toString() + ":81");
  Serial.println("Feeder Configuration:");
  Serial.println("- Total Height: " + String(FEEDER_HEIGHT) + " cm");
  Serial.println("- Min Distance (Full): " + String(MIN_DISTANCE) + " cm");
  Serial.println("- Max Distance (Empty): " + String(MAX_DISTANCE) + " cm");
}

void loop() {
  webSocket.loop();
  
  // Read sensors periodically
  if (millis() - lastSensorRead >= sensorInterval) {
    readSensors();
    broadcastSensorData();
    lastSensorRead = millis();
  }
  
  // Handle heartbeat timeout (disconnect inactive clients)
  if (millis() - lastHeartbeat > 60000) { // 60 seconds timeout
    // Could implement client timeout logic here
    lastHeartbeat = millis();
  }
  
  delay(10); // Small delay to prevent watchdog reset
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      
      // Send initial device state
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
  // Parse JSON message
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("Failed to parse JSON message");
    sendError(num, "Invalid JSON format");
    return;
  }
  
  String action = doc["action"];
  Serial.println("Action: " + action);
  
  // Handle different actions
  if (action == "toggle_led") {
    handleLEDToggle(num);
  }
  else if (action == "toggle_relay") {
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

void handleLEDToggle(uint8_t num) {
  ledState = !ledState;
  digitalWrite(LED_PIN, ledState ? HIGH : LOW);
  
  Serial.println("LED toggled to: " + String(ledState ? "ON" : "OFF"));
  
  // Send response
  DynamicJsonDocument response(512);
  response["type"] = "control_response";
  response["data"]["ledState"] = ledState;
  response["data"]["action"] = "led_toggle";
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void handleRelayToggle(uint8_t num) {
  relayState = !relayState;
  digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
  
  Serial.println("Relay toggled to: " + String(relayState ? "ON" : "OFF"));
  
  // Send response
  DynamicJsonDocument response(512);
  response["type"] = "control_response";
  response["data"]["relayState"] = relayState;
  response["data"]["action"] = "relay_toggle";
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void setSensorInterval(uint8_t num, int interval) {
  if (interval >= 1000 && interval <= 60000) { // 1 second to 1 minute
    sensorInterval = interval;
    Serial.println("Sensor interval set to: " + String(interval) + "ms");
    
    DynamicJsonDocument response(512);
    response["type"] = "control_response";
    response["data"]["sensorInterval"] = interval;
    response["data"]["action"] = "interval_set";
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
  
  DynamicJsonDocument response(256);
  response["type"] = "status";
  response["data"]["pong"] = true;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

float readUltrasonicDistance() {
  // Clear the trigger pin
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  
  // Send a 10µs pulse to trigger pin
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // Read the echo pin and calculate distance
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  
  if (duration == 0) {
    // Timeout occurred, sensor might be disconnected
    sensors.ultrasonicSensorConnected = false;
    return NAN;
  }
  
  sensors.ultrasonicSensorConnected = true;
  
  // Calculate distance in centimeters
  // Speed of sound = 343 m/s = 0.0343 cm/µs
  // Distance = (Duration × Speed of Sound) / 2
  float distance = (duration * 0.0343) / 2;
  
  return distance;
}

float calculateFoodLevel(float distance) {
  if (isnan(distance)) {
    return NAN;
  }
  
  // Clamp distance to valid range
  distance = constrain(distance, MIN_DISTANCE, MAX_DISTANCE);
  
  // Calculate percentage (inverted - smaller distance = more food)
  float percentage = ((MAX_DISTANCE - distance) / (MAX_DISTANCE - MIN_DISTANCE)) * 100;
  
  // Ensure percentage is between 0-100
  percentage = constrain(percentage, 0, 100);
  
  return percentage;
}

void readSensors() {
  // Read DS18B20 Temperature Sensor
  if (sensors.temperatureSensorConnected) {
    // Request temperature reading from DS18B20
    temperatureSensor.requestTemperatures();
    
    // Get temperature in Celsius
    sensors.temperature = temperatureSensor.getTempCByIndex(0);
    
    // Check if reading is valid
    if (sensors.temperature == DEVICE_DISCONNECTED_C) {
      Serial.println("Error: DS18B20 sensor disconnected");
      sensors.temperature = NAN;
      sensors.temperatureSensorConnected = false;
    }
  } else {
    sensors.temperature = NAN;
  }
  
  // Read HC-SR04 Ultrasonic Sensor
  sensors.distance = readUltrasonicDistance();
  sensors.foodLevelPercentage = calculateFoodLevel(sensors.distance);
  
  // Debug output
  Serial.println("--- Sensor Readings ---");
  if (!isnan(sensors.temperature)) {
    Serial.println("Temperature: " + String(sensors.temperature, 1) + "°C");
  } else {
    Serial.println("Temperature: Error/Disconnected");
  }
  
  if (!isnan(sensors.distance)) {
    Serial.println("Distance: " + String(sensors.distance, 1) + " cm");
    Serial.println("Food Level: " + String(sensors.foodLevelPercentage, 1) + "%");
  } else {
    Serial.println("Ultrasonic: Error/Disconnected");
  }
  Serial.println("----------------------");
}

void sendSensorData(uint8_t num) {
  DynamicJsonDocument response(1024);
  response["type"] = "sensor_data";
  
  // Include temperature if valid
  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    response["data"]["temperature"] = sensors.temperature;
  }
  
  // Include ultrasonic sensor data if valid
  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    response["data"]["distance"] = round(sensors.distance * 10) / 10.0; // Round to 1 decimal
    response["data"]["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }
  
  response["data"]["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  response["data"]["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;
  response["data"]["sensorConnected"] = sensors.temperatureSensorConnected; // Keep for backward compatibility
  response["data"]["ledState"] = ledState;
  response["data"]["relayState"] = relayState;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void broadcastSensorData() {
  DynamicJsonDocument response(1024);
  response["type"] = "sensor_data";
  
  // Include temperature if valid
  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    response["data"]["temperature"] = sensors.temperature;
  }
  
  // Include ultrasonic sensor data if valid
  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    response["data"]["distance"] = round(sensors.distance * 10) / 10.0; // Round to 1 decimal
    response["data"]["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }
  
  response["data"]["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  response["data"]["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;
  response["data"]["sensorConnected"] = sensors.temperatureSensorConnected; // Keep for backward compatibility
  response["data"]["ledState"] = ledState;
  response["data"]["relayState"] = relayState;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.broadcastTXT(responseStr);
}

void sendDeviceStatus(uint8_t num) {
  readSensors(); // Get latest sensor data
  
  DynamicJsonDocument response(1024);
  response["type"] = "status";
  response["data"]["connected"] = true;
  response["data"]["ledState"] = ledState;
  response["data"]["relayState"] = relayState;
  response["data"]["sensorInterval"] = sensorInterval;
  response["data"]["temperatureSensorConnected"] = sensors.temperatureSensorConnected;
  response["data"]["ultrasonicSensorConnected"] = sensors.ultrasonicSensorConnected;
  response["data"]["sensorConnected"] = sensors.temperatureSensorConnected; // Keep for backward compatibility
  
  // Include current temperature reading
  if (!isnan(sensors.temperature) && sensors.temperatureSensorConnected) {
    response["data"]["temperature"] = sensors.temperature;
  }
  
  // Include current ultrasonic sensor reading
  if (!isnan(sensors.distance) && sensors.ultrasonicSensorConnected) {
    response["data"]["distance"] = round(sensors.distance * 10) / 10.0;
    response["data"]["foodLevelPercentage"] = round(sensors.foodLevelPercentage * 10) / 10.0;
  }
  
  // Include feeder configuration
  response["data"]["feederConfig"]["height"] = FEEDER_HEIGHT;
  response["data"]["feederConfig"]["minDistance"] = MIN_DISTANCE;
  response["data"]["feederConfig"]["maxDistance"] = MAX_DISTANCE;
  
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
}

void sendError(uint8_t num, String errorMessage) {
  DynamicJsonDocument response(512);
  response["type"] = "error";
  response["data"]["message"] = errorMessage;
  response["timestamp"] = millis();
  
  String responseStr;
  serializeJson(response, responseStr);
  webSocket.sendTXT(num, responseStr);
} 