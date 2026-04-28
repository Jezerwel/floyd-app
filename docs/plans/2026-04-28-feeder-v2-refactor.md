# Floyd Feeder v2 — Full Refactor Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite firmware for L298N motor driver (auger + impeller with PWM), replace relay/stepper code, add server-side scheduling with SQLite, refactor app UI for dual motor control + scheduling + configurable alerts, and strip all dead code (MQTT, socket.io).

**Architecture:** ESP8266 runs WebSocket server (port 81) controlling L298N via 6 GPIO pins. Cloud proxy server (Express + ws + Prisma/SQLite + node-cron) relays messages and runs scheduled feeds. React Native app connects to cloud proxy via WebSocket, sends feed commands and manages schedules/alerts. Feeding sequence: impeller pre-spin → auger runs → auger stops → impeller post-spins 1-2s → impeller stops.

**Tech Stack:** ESP8266 (Arduino C++, ArduinoJson, OneWire, DallasTemperature, WebSocketsServer, EEPROM), Node.js (Express 4, ws, Prisma, SQLite, node-cron, TypeScript 5.3), React Native (Expo 54, TypeScript 5.9, react-native-reanimated 4.1)

**Decisions from grill-me:**

| Decision | Choice |
|---|---|
| Motor driver | L298N (6 pins: ENA/IN1/IN2 + ENB/IN3/IN4) |
| Motor assignment | Doesn't matter — A=Auger, B=Impeller for wiring simplicity |
| Feeding sequence | Impeller pre-spin 1-2s → auger → auger stops → impeller post-spins 1-2s → impeller stops |
| Speed control | App sliders for both auger + impeller, one trigger button |
| Duration | Configurable in app with firmware safety limits |
| Jam clearing | Auger reverse button |
| Scheduling | Server-side (SQLite + Prisma + node-cron) |
| Database | SQLite (file-based, zero setup on Railway) |
| Connection | Cloud proxy (wss://floyd-feeder.up.railway.app → ESP8266 WebSocket) |
| MQTT | Removed entirely |
| Dead code | Stripped (socket.io, unused deps, dead components) |
| Alert thresholds | Configurable in app |
| Feeder dimensions | Easily editable constants, keep originals for now |
| Food level formula | Two-case: d ≤ 10" → Vfrustum + Vcylinder; d > 10" → Vfrustum only. Display: current/total * 100% |

---

### Task 0: Codebase Cleanup (Dead Code Removal)

**Files:**
- Delete: `ESP8266_MQTT_Server.ino`
- Modify: `package.json`
- Modify: `server/package.json`
- Delete: `server/src/services/mqttBridge.ts`
- Modify: `server/src/server.ts`
- Modify: `server/src/types/index.ts`
- Delete: `components/TimerControl.tsx`
- Delete: `types/timer.ts`
- Delete: `components/Collapsible.tsx` (unused)
- Delete: `components/ParallaxScrollView.tsx` (unused)
- Delete: `components/HelloWave.tsx` (unused)

**Step 1: Remove MQTT firmware**

Delete `ESP8266_MQTT_Server.ino` entirely.

```
rm ESP8266_MQTT_Server.ino
```

**Step 2: Remove MQTT bridge service**

Delete `server/src/services/mqttBridge.ts` entirely.

```
rm server/src/services/mqttBridge.ts
```

**Step 3: Clean server.ts — remove MQTT imports and initialization**

In `server/src/server.ts`:
- Remove `import { MQTTBridge } from './services/mqttBridge'`
- Remove `private mqttBridge?: MQTTBridge` field
- Remove MQTT bridge initialization in constructor
- Remove MQTT-related logic in message handling
- Remove `USE_MQTT` env check — always use WebSocket direct mode
- Update `/health` endpoint to remove MQTT fields
- Update `/stats` endpoint
- Update `/api/config` endpoint
- Update graceful shutdown to remove `mqttBridge.disconnect()`

**Step 4: Clean server types — remove MQTT types**

In `server/src/types/index.ts`:
- Remove `MQTTConfig` interface
- Remove `useMqtt` from `ServerConfig`
- Remove `mqttConfig` from `ServerConfig`
- Remove MQTT-related default values

**Step 5: Remove unused React Native components**

Delete files:
```
rm components/TimerControl.tsx
rm types/timer.ts
rm components/Collapsible.tsx
rm components/ParallaxScrollView.tsx
rm components/HelloWave.tsx
```

**Step 6: Clean root package.json — remove unused deps**

In root `package.json`:
- Remove `"socket.io"` dependency
- Remove `"socket.io-client"` dependency  
- Remove `"express"` dependency (Express in RN root is a mistake — server has its own)
- Remove `"ws"` dependency from root (server has its own)

Run: `npm install` to update lockfile.

**Step 7: Verify nothing broke**

Run: `npx tsc --noEmit` (root) and `npx tsc --noEmit` in server/

Expected: No type errors related to removed code (may have pre-existing unrelated errors).

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove MQTT path, dead deps, and unused components"
```

---

### Task 1: Firmware Rewrite — Pin Definitions & Constants

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino` (full rewrite)

**Step 1: Define new pin layout**

Replace all pin definitions at top of file:

```cpp
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
```

**Note:** GPIO0 (D3) and GPIO15 (D8) have boot-mode constraints. Both must be LOW at boot — L298N IN pins default LOW (motor stopped) so this is safe. GPIO16 (D0) has no PWM but is used as a direction pin only (digital HIGH/LOW), which is fine.

**Step 2: Define feeding sequence constants**

```cpp
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

#define CYLINDER_RADIUS_CM       10.0   // Radius of cylinder section (cm)
#define CYLINDER_HEIGHT_CM       25.4   // Height of cylinder = 10 inches (cm)
#define FRUSTUM_TOP_RADIUS_CM    10.0   // Radius at top of frustum (same as cylinder)
#define FRUSTUM_BOTTOM_RADIUS_CM 5.0    // Radius at bottom of frustum (cm)
#define FRUSTUM_HEIGHT_CM        15.0   // Height of frustum section (cm)

// Derived total volume (calculated once at boot)
float totalVolumeCm3 = 0;

// === Sensor Timing ===
#define DEFAULT_SENSOR_INTERVAL  5000   // ms between sensor reads
#define MIN_SENSOR_INTERVAL      1000
#define MAX_SENSOR_INTERVAL      60000
```

**Step 3: Define motor state machine enum**

```cpp
enum MotorState {
  STATE_IDLE,          // Both motors stopped
  STATE_PRE_SPIN,      // Impeller running, auger stopped
  STATE_FEEDING,       // Both motors running
  STATE_POST_SPIN,     // Auger stopped, impeller running
  STATE_JAM_CLEAR,     // Auger reverse
  STATE_STOPPING       // Slowing to stop (graceful)
};
```

**Step 4: Define motor state tracking struct**

```cpp
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
```

---

### Task 2: Firmware Rewrite — Motor Control Functions

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino`

**Step 1: Write motor driving primitives**

```cpp
void setAugerMotor(int speed, bool forward) {
  // Constrain speed to valid PWM range
  speed = constrain(speed, 0, 1023);
  
  if (speed == 0) {
    // Stop: all direction pins LOW (coast)
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
  // Impeller only runs forward (IN3=HIGH, IN4=LOW)
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
```

**Step 2: Write motor state machine tick function**

This is the core of the firmware. Called every `loop()` iteration — non-blocking.

```cpp
void updateMotorState() {
  MotorControl& mc = motor;
  unsigned long elapsed = millis() - mc.stateStartTime;
  
  switch (mc.state) {
    case STATE_IDLE:
      // Nothing to do
      break;
      
    case STATE_PRE_SPIN:
      // Impeller running, waiting for pre-spin to complete
      if (elapsed >= mc.preSpinMs) {
        // Transition to feeding: start auger
        setAugerMotor(mc.augerSpeed, true);
        mc.state = STATE_FEEDING;
        mc.stateStartTime = millis();
      }
      break;
      
    case STATE_FEEDING:
      // Both motors running, waiting for feed duration
      if (elapsed >= mc.feedMs) {
        // Stop auger, impeller continues
        setAugerMotor(0, true);
        mc.state = STATE_POST_SPIN;
        mc.stateStartTime = millis();
      }
      break;
      
    case STATE_POST_SPIN:
      // Auger stopped, impeller running
      if (elapsed >= mc.postSpinMs) {
        // Stop impeller
        setImpellerMotor(0);
        mc.state = STATE_IDLE;
        mc.stateStartTime = 0;
        sendFeedingComplete();
      }
      break;
      
    case STATE_JAM_CLEAR:
      // Auger running in reverse
      if (elapsed >= mc.jamClearMs) {
        stopAllMotors();
        mc.state = STATE_IDLE;
        mc.stateStartTime = 0;
        sendJamClearComplete();
      }
      break;
      
    case STATE_STOPPING:
      // Emergency stop — kill power immediately
      stopAllMotors();
      mc.state = STATE_IDLE;
      mc.stateStartTime = 0;
      break;
  }
}
```

**Step 3: Write feed trigger and clear jam functions**

```cpp
void startFeeding(int augerSpeed, int impellerSpeed, unsigned long preSpinMs, unsigned long feedMs, unsigned long postSpinMs) {
  // Safety: apply min/max bounds
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
  
  // Start impeller immediately
  setImpellerMotor(impellerSpeed);
  setAugerMotor(0, true);  // Auger off for now
  
  motor.state = STATE_PRE_SPIN;
  motor.stateStartTime = millis();
}

void startJamClear(int speed, unsigned long duration) {
  speed = constrain(speed, 0, 1023);
  duration = constrain(duration, 500, 5000);
  
  motor.jamClearMs = duration;
  
  // Stop impeller, start auger in reverse
  setImpellerMotor(0);
  setAugerMotor(speed, false);  // false = reverse
  
  motor.state = STATE_JAM_CLEAR;
  motor.stateStartTime = millis();
}

void emergencyStop() {
  motor.state = STATE_STOPPING;
  motor.stateStartTime = millis();
}
```

---

### Task 3: Firmware Rewrite — WebSocket Protocol Update

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino`

**Step 1: Remove old action handlers**

Delete old `handleRelayToggle()` function entirely. Remove relay pin init from `setup()`. Remove stepper motor init/library from `setup()`. Remove `handleStepperMotor()` from `loop()`. Remove old `handleWebSocketMessage()` action cases.

**Step 2: Write new WebSocket command handler**

```cpp
void handleWebSocketMessage(uint8_t num, String message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    sendError(num, "Invalid JSON");
    return;
  }
  
  String action = doc["action"] | "";
  
  if (action == "start_feed") {
    int augerSpeed = doc["augerSpeed"] | DEFAULT_AUGER_SPEED;
    int impellerSpeed = doc["impellerSpeed"] | DEFAULT_IMPELLER_SPEED;
    unsigned long preSpinMs = doc["preSpinMs"] | DEFAULT_PRE_SPIN_MS;
    unsigned long feedMs = doc["feedMs"] | DEFAULT_FEED_MS;
    unsigned long postSpinMs = doc["postSpinMs"] | DEFAULT_POST_SPIN_MS;
    
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
    int speed = doc["speed"] | DEFAULT_AUGER_SPEED;
    unsigned long duration = doc["duration"] | DEFAULT_JAM_CLEAR_MS;
    
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
    // Same as before — request immediate sensor read
    SensorData data = readSensors();
    broadcastSensorData(data);
    
  } else if (action == "set_sensor_interval") {
    unsigned long interval = doc["parameters"]["interval"] | DEFAULT_SENSOR_INTERVAL;
    sensorInterval = constrain(interval, MIN_SENSOR_INTERVAL, MAX_SENSOR_INTERVAL);
    
    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "set_sensor_interval";
    data["success"] = true;
    data["interval"] = sensorInterval;
    response["timestamp"] = millis();
    broadcastResponse(response);
    
  } else if (action == "set_config") {
    // Update container geometry dynamically
    if (doc.containsKey("parameters")) {
      JsonObject params = doc["parameters"];
      if (params.containsKey("cylinderRadius"))      cylinderRadius      = params["cylinderRadius"];
      if (params.containsKey("cylinderHeight"))      cylinderHeight      = params["cylinderHeight"];
      if (params.containsKey("frustumTopRadius"))    frustumTopRadius    = params["frustumTopRadius"];
      if (params.containsKey("frustumBottomRadius")) frustumBottomRadius = params["frustumBottomRadius"];
      if (params.containsKey("frustumHeight"))       frustumHeight       = params["frustumHeight"];
      
      // Recompute total volume with new dimensions
      totalVolumeCm3 = computeTotalVolume();
      
      // Save to EEPROM
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
    handlePing(num);
    
  } else {
    sendError(num, "Unknown action: " + action);
  }
}

void broadcastResponse(JsonDocument& doc) {
  String output;
  serializeJson(doc, output);
  webSocket.broadcastTXT(output);
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
```

**Step 3: Update sensor_data broadcast to include motor state**

```cpp
void broadcastSensorData() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");
  
  data["temperature"] = currentData.temperature;
  data["temperatureSensorConnected"] = currentData.temperatureSensorConnected;
  data["distance"] = currentData.distance;
  data["foodLevelPercentage"] = currentData.foodLevelPercentage;
  data["ultrasonicSensorConnected"] = currentData.ultrasonicSensorConnected;
  
  // Motor state
  data["motorState"] = motor.state;  // idle, pre_spin, feeding, post_spin, jam_clear
  data["augerSpeed"] = motor.augerSpeed;
  data["impellerSpeed"] = motor.impellerSpeed;
  
  doc["timestamp"] = millis();
  
  String output;
  serializeJson(doc, output);
  webSocket.broadcastTXT(output);
}
```

**Step 4: Update device status to include new config**

```cpp
void sendDeviceStatus(uint8_t num) {
  StaticJsonDocument<512> doc;
  doc["type"] = "status";
  JsonObject data = doc.createNestedObject("data");
  data["pong"] = true;
  data["uptime"] = millis();
  data["freeHeap"] = ESP.getFreeHeap();
  data["motorState"] = motor.state;
  
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
  
  doc["timestamp"] = millis();
  
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(num, output);
}
```

**Step 5: Update setup() function**

Remove stepper init, relay pin init. Add L298N pin init:

```cpp
void setup() {
  Serial.begin(115200);
  
  // Initialize motor driver pins
  pinMode(MOTOR_A_ENA, OUTPUT);
  pinMode(MOTOR_A_IN1, OUTPUT);
  pinMode(MOTOR_A_IN2, OUTPUT);
  pinMode(MOTOR_B_ENB, OUTPUT);
  pinMode(MOTOR_B_IN3, OUTPUT);
  pinMode(MOTOR_B_IN4, OUTPUT);
  stopAllMotors();  // Ensure motors are off at boot
  
  // Initialize ultrasonic pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  // Initialize DS18B20
  sensors.begin();
  
  // Load config from EEPROM
  loadConfig();
  
  // Connect to WiFi
  connectToWiFi();
  
  // Start WebSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
}
```

**Step 6: Update loop() function**

```cpp
void loop() {
  ESP.wdtFeed();
  
  // Handle WebSocket events
  webSocket.loop();
  
  // Check WiFi connection
  checkWiFiConnection();
  
  // Update motor state machine
  updateMotorState();
  
  // Read sensors on interval
  unsigned long now = millis();
  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;
    currentData = readSensors();
    broadcastSensorData();
  }
}
```

**Step 7: Add EEPROM config save/load**

```cpp
#include <EEPROM.h>

struct EEPROMConfig {
  float cylinderRadius;
  float cylinderHeight;
  float frustumTopRadius;
  float frustumBottomRadius;
  float frustumHeight;
  unsigned long sensorInterval;
  uint8_t checksum;
};

void loadConfig() {
  EEPROM.begin(sizeof(EEPROMConfig));
  EEPROMConfig config;
  EEPROM.get(0, config);
  
  // Validate with simple checksum
  uint8_t sum = (uint8_t)((int)config.cylinderRadius + (int)config.cylinderHeight + 
                (int)config.frustumTopRadius + (int)config.frustumBottomRadius + 
                (int)config.frustumHeight + (int)config.sensorInterval) & 0xFF;
  
  if (sum == config.checksum) {
    cylinderRadius = config.cylinderRadius;
    cylinderHeight = config.cylinderHeight;
    frustumTopRadius = config.frustumTopRadius;
    frustumBottomRadius = config.frustumBottomRadius;
    frustumHeight = config.frustumHeight;
    sensorInterval = config.sensorInterval;
    
    // Recompute total volume with loaded dimensions
    totalVolumeCm3 = computeTotalVolume();
  }
  // If checksum fails, defaults (from #defines) are used
}

void saveConfig() {
  EEPROMConfig config;
  config.cylinderRadius = cylinderRadius;
  config.cylinderHeight = cylinderHeight;
  config.frustumTopRadius = frustumTopRadius;
  config.frustumBottomRadius = frustumBottomRadius;
  config.frustumHeight = frustumHeight;
  config.sensorInterval = sensorInterval;
  config.checksum = (uint8_t)((int)cylinderRadius + (int)cylinderHeight + 
                    (int)frustumTopRadius + (int)frustumBottomRadius + 
                    (int)frustumHeight + (int)sensorInterval) & 0xFF;
  
  EEPROM.put(0, config);
  EEPROM.commit();
}
```

**Step 8: Add volume-based food level calculation**

Replace the old linear interpolation with two-case frustum+cylinder volume formula:

```cpp
// ---- Volume Calculation Helpers ----

// Volume of conical frustum: V = (π/3) * h * (R² + Rr + r²)
float frustumVolume(float h, float R, float r) {
  return (PI / 3.0) * h * (R*R + R*r + r*r);
}

// Volume of cylinder: V = π * r² * h
float cylinderVolume(float h, float r) {
  return PI * r * r * h;
}

// Calculate total container volume (called once in setup)
float computeTotalVolume() {
  float vFrustum = frustumVolume(FRUSTUM_HEIGHT_CM, FRUSTUM_TOP_RADIUS_CM, FRUSTUM_BOTTOM_RADIUS_CM);
  float vCylinder = cylinderVolume(CYLINDER_HEIGHT_CM, CYLINDER_RADIUS_CM);
  return vFrustum + vCylinder;
}

// Calculate current food volume from ultrasonic distance
// distanceCm = distance from sensor to food surface
float computeCurrentVolume(float distanceCm) {
  float transitionCm = CYLINDER_HEIGHT_CM;  // 10 inches in cm (25.4)
  float vCylinderFull = cylinderVolume(CYLINDER_HEIGHT_CM, CYLINDER_RADIUS_CM);
  float vFrustumFull  = frustumVolume(FRUSTUM_HEIGHT_CM, FRUSTUM_TOP_RADIUS_CM, FRUSTUM_BOTTOM_RADIUS_CM);
  
  if (distanceCm <= transitionCm) {
    // Case 1: d ≤ 10" — food in both cylinder AND frustum sections
    // Cylinder portion: from distanceCm down to transitionCm is filled
    float cylinderFilledHeight = transitionCm - distanceCm;
    float vCylinderPartial = cylinderVolume(cylinderFilledHeight, CYLINDER_RADIUS_CM);
    // Frustum is completely full
    return vCylinderPartial + vFrustumFull;
    
  } else {
    // Case 2: d > 10" — food only in frustum section (cylinder is empty)
    // Frustum portion: from transitionCm down to distanceCm is filled
    float frustumFilledHeight = distanceCm - transitionCm;
    // Cap at frustum height
    if (frustumFilledHeight > FRUSTUM_HEIGHT_CM) frustumFilledHeight = FRUSTUM_HEIGHT_CM;
    
    // Top radius at the current food level within the frustum
    // Linear interpolation: radius = R_top - (h / H) * (R_top - R_bottom)
    float rAtLevel = FRUSTUM_TOP_RADIUS_CM - 
                     (frustumFilledHeight / FRUSTUM_HEIGHT_CM) * 
                     (FRUSTUM_TOP_RADIUS_CM - FRUSTUM_BOTTOM_RADIUS_CM);
    
    float vFrustumPartial = frustumVolume(frustumFilledHeight, FRUSTUM_TOP_RADIUS_CM, rAtLevel);
    return vFrustumPartial;
  }
}

// Calculate food level as percentage displayed in app
// Display = Current Volume / Total Volume * 100%
float calculateFoodLevel(float distanceCm) {
  if (totalVolumeCm3 <= 0) return 0;
  float currentVol = computeCurrentVolume(distanceCm);
  float pct = (currentVol / totalVolumeCm3) * 100.0;
  return constrain(pct, 0, 100);
}
```

Add to `setup()`:
```cpp
void setup() {
  // ... existing setup code ...
  
  // Compute total volume once
  totalVolumeCm3 = computeTotalVolume();
}
```

Replace old `calculateFoodLevel` call in `readSensors()` with new formula:
```cpp
SensorData readSensors() {
  SensorData data;
  // ... temperature reading unchanged ...
  
  float distanceCm = readUltrasonicDistance();
  data.distance = distanceCm;
  data.ultrasonicSensorConnected = (distanceCm > 0);
  
  // New: volume-based calculation
  if (data.ultrasonicSensorConnected) {
    data.foodLevelPercentage = calculateFoodLevel(distanceCm);
  } else {
    data.foodLevelPercentage = 0;
  }
  
  return data;
}
```

**Key behavior:**
- When `d ≤ 10"`: food fills part of cylinder + full frustum → `Vcurrent = Vcylinder_partial + Vfrustum_full`
- When `d > 10"`: food only in frustum → `Vcurrent = Vfrustum_partial`
- Display: `Vcurrent / Vtotal * 100%`
- All dimension constants in cm; transition at 10" (= 25.4 cm)

---

### Task 4: Server — Database Schema (Prisma + SQLite)

**Files:**
- Create: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/` (auto-generated on migrate)
- Modify: `server/package.json`

**Step 1: Add Prisma dependencies to server**

In `server/package.json`:
```json
{
  "dependencies": {
    "@prisma/client": "^6.11.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "prisma": "^6.11.1"
  },
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:push": "prisma db push"
  }
}
```

Run: `npm install` in server/

**Step 2: Create Prisma schema**

Create `server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./floyd.db"
}

model FeedSchedule {
  id        String   @id @default(uuid())
  label     String
  enabled   Boolean  @default(true)
  time      String   // HH:mm format (server timezone)
  daysOfWeek String  @default("0,1,2,3,4,5,6") // comma-separated 0=Sun
  augerSpeed    Int  @default(768)
  impellerSpeed Int  @default(1023)
  preSpinMs     Int  @default(1500)
  feedMs        Int  @default(3000)
  postSpinMs    Int  @default(1500)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model FeedLog {
  id          String   @id @default(uuid())
  timestamp   DateTime @default(now())
  feedMs      Int
  augerSpeed  Int
  impellerSpeed Int
  success     Boolean  @default(true)
  errorMessage String?
}

model AlertConfig {
  id            String @id @default("default")
  lowFoodPct    Int    @default(30)
  criticalFoodPct Int  @default(10)
  tempMin       Float  @default(20)
  tempMax       Float  @default(32)
  updatedAt     DateTime @updatedAt
}
```

**Step 3: Generate Prisma client and run migration**

```bash
cd server
npx prisma migrate dev --name init
```

**Step 4: Create Prisma client singleton**

Create `server/src/services/db.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

---

### Task 5: Server — Schedule Service

**Files:**
- Create: `server/src/services/scheduler.ts`
- Modify: `server/src/server.ts`
- Modify: `server/src/types/index.ts`

**Step 1: Create scheduler service**

Create `server/src/services/scheduler.ts`:

```typescript
import cron from 'node-cron';
import prisma from './db';
import { ESP8266Client } from './esp8266Client';

interface ScheduledFeed {
  id: string;
  label: string;
  time: string;
  daysOfWeek: string;
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}

class FeedScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private espClient: ESP8266Client;

  constructor(espClient: ESP8266Client) {
    this.espClient = espClient;
  }

  async start() {
    console.log('[Scheduler] Loading schedules from database...');
    const schedules = await prisma.feedSchedule.findMany({
      where: { enabled: true },
    });
    for (const schedule of schedules) {
      this.addJob(schedule);
    }
    console.log(`[Scheduler] Loaded ${this.jobs.size} schedules`);
  }

  addJob(schedule: ScheduledFeed) {
    if (!schedule.enabled) return;

    const [hour, minute] = schedule.time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return;

    // Build cron expression: "minute hour * * day-of-week"
    // Convert daysOfWeek "0,1,2,3,4,5,6" to cron format
    const cronExpr = `${minute} ${hour} * * ${schedule.daysOfWeek}`;
    
    const task = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Running scheduled feed: ${schedule.label}`);
      
      if (!this.espClient.isConnected()) {
        console.log(`[Scheduler] ESP8266 not connected, skipping feed: ${schedule.label}`);
        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: false,
            errorMessage: 'ESP8266 not connected',
          },
        });
        return;
      }

      try {
        this.espClient.sendCommand({
          action: 'start_feed',
          parameters: {
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            preSpinMs: schedule.preSpinMs,
            feedMs: schedule.feedMs,
            postSpinMs: schedule.postSpinMs,
          },
        });

        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: true,
          },
        });
      } catch (err: any) {
        console.error(`[Scheduler] Feed failed: ${err.message}`);
        await prisma.feedLog.create({
          data: {
            feedMs: schedule.feedMs,
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            success: false,
            errorMessage: err.message,
          },
        });
      }
    });

    this.jobs.set(schedule.id, task);
  }

  removeJob(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  stop() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
  }
}

export default FeedScheduler;
```

**Step 2: Integrate scheduler into server.ts**

In `server/src/server.ts`:
- Import `FeedScheduler` and `db`
- Add `private scheduler: FeedScheduler` field
- In constructor after ESP8266 client init: `this.scheduler = new FeedScheduler(this.espClient)`
- In `start()` after ESP connect: `await this.scheduler.start()`
- In `shutdown()`: `this.scheduler.stop()` and `await prisma.$disconnect()`

**Step 3: Add REST API endpoints for schedules**

Add to `setupRoutes()`:

```typescript
// GET /api/schedules — list all schedules
this.app.get('/api/schedules', async (_req: Request, res: Response) => {
  try {
    const schedules = await prisma.feedSchedule.findMany({
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch schedules' });
  }
});

// POST /api/schedules — create schedule
this.app.post('/api/schedules', async (req: Request, res: Response) => {
  try {
    const { label, time, daysOfWeek, augerSpeed, impellerSpeed, preSpinMs, feedMs, postSpinMs } = req.body;
    
    const schedule = await prisma.feedSchedule.create({
      data: {
        label: label || 'Feed',
        time,
        daysOfWeek: daysOfWeek || '0,1,2,3,4,5,6',
        augerSpeed: augerSpeed || 768,
        impellerSpeed: impellerSpeed || 1023,
        preSpinMs: preSpinMs || 1500,
        feedMs: feedMs || 3000,
        postSpinMs: postSpinMs || 1500,
        enabled: true,
      },
    });
    
    this.scheduler.addJob(schedule);
    res.status(201).json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

// PUT /api/schedules/:id — update schedule
this.app.put('/api/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    this.scheduler.removeJob(id);
    
    const schedule = await prisma.feedSchedule.update({
      where: { id },
      data,
    });
    
    if (schedule.enabled) {
      this.scheduler.addJob(schedule);
    }
    
    res.json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

// DELETE /api/schedules/:id — delete schedule
this.app.delete('/api/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    this.scheduler.removeJob(id);
    await prisma.feedSchedule.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete schedule' });
  }
});

// GET /api/history — get feed logs
this.app.get('/api/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await prisma.feedLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// GET /api/alerts/config
this.app.get('/api/alerts/config', async (_req: Request, res: Response) => {
  try {
    const config = await prisma.alertConfig.findUnique({ where: { id: 'default' } });
    res.json({ success: true, config: config || { lowFoodPct: 30, criticalFoodPct: 10, tempMin: 20, tempMax: 32 } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch alert config' });
  }
});

// PUT /api/alerts/config
this.app.put('/api/alerts/config', async (req: Request, res: Response) => {
  try {
    const { lowFoodPct, criticalFoodPct, tempMin, tempMax } = req.body;
    const config = await prisma.alertConfig.upsert({
      where: { id: 'default' },
      update: { lowFoodPct, criticalFoodPct, tempMin, tempMax },
      create: { id: 'default', lowFoodPct, criticalFoodPct, tempMin, tempMax },
    });
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update alert config' });
  }
});
```

---

### Task 6: Server — Update WebSocket Types

**Files:**
- Modify: `server/src/types/index.ts`

**Step 1: Add new command actions**

```typescript
export type CommandAction = 
  | 'toggle_relay'     // REMOVED
  | 'start_feed'       // NEW
  | 'stop_feed'        // NEW
  | 'clear_jam'        // NEW
  | 'get_sensors'
  | 'set_sensor_interval'
  | 'set_config'       // NEW
  | 'ping';
```

**Step 2: Update SensorData to include motor state**

```typescript
export interface SensorData {
  temperature: number;
  temperatureSensorConnected: boolean;
  distance: number;
  foodLevelPercentage: number;
  ultrasonicSensorConnected: boolean;
  // Motor state
  motorState: 'idle' | 'pre_spin' | 'feeding' | 'post_spin' | 'jam_clear';
  augerSpeed: number;
  impellerSpeed: number;
}
```

**Step 3: Update FeederConfig**

```typescript
export interface FeederConfig {
  cylinderRadius: number;
  cylinderHeight: number;
  frustumTopRadius: number;
  frustumBottomRadius: number;
  frustumHeight: number;
  totalVolumeCm3: number;
  sensorInterval: number;
  defaultPreSpinMs: number;
  defaultPostSpinMs: number;
  defaultFeedMs: number;
}
```

**Step 4: Update DeviceState — remove LED/relay, add motor**

```typescript
export interface DeviceState {
  motorState: string;
  sensorInterval: number;
  connected: boolean;
}
```

**Step 5: Update ControlResponse**

```typescript
export interface ControlResponse {
  action: string;
  success: boolean;
  motorState?: string;
  message?: string;
}
```

**Step 6: Remove MQTTConfig, update ServerConfig**

Remove `MQTTConfig` interface. Remove `useMqtt` and `mqttConfig` from `ServerConfig`.

---

### Task 7: Server — Update ESP8266 Client & Proxy Handlers

**Files:**
- Modify: `server/src/services/esp8266Client.ts`
- Modify: `server/src/websocket/proxyHandlers.ts`

**Step 1: Update ESP8266Client**

No structural changes needed — `sendCommand()` already sends arbitrary JSON. Just update JSDoc comments to reflect new commands.

Add helper method:

```typescript
async sendFeedCommand(params: {
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}): Promise<void> {
  this.sendCommand({
    action: 'start_feed',
    parameters: params,
  });
}

async sendJamClear(speed: number = 768, duration: number = 2000): Promise<void> {
  this.sendCommand({
    action: 'clear_jam',
    parameters: { speed, duration },
  });
}

async sendConfigUpdate(config: Partial<FeederConfig>): Promise<void> {
  this.sendCommand({
    action: 'set_config',
    parameters: config,
  });
}
```

**Step 2: Update WebSocketProxyHandler**

In `handleConnection()` — update the sensor_data forwarding to pass motor state through unchanged (it already does this). No structural changes needed since it's a transparent proxy.

Update `getStats()` to remove MQTT references, add scheduler info.

---

### Task 8: App — Update TypeScript Types

**Files:**
- Modify: `hooks/useESP8266Context.tsx`

**Step 1: Update DeviceData interface**

```typescript
interface DeviceData {
  // Sensors
  temperature: number;
  distance: number;
  foodLevelPercentage: number;
  temperatureSensorConnected: boolean;
  ultrasonicSensorConnected: boolean;
  
  // Motor
  motorState: 'idle' | 'pre_spin' | 'feeding' | 'post_spin' | 'jam_clear';
  augerSpeed: number;
  impellerSpeed: number;
  
  // Config
  feederConfig: {
    cylinderRadius: number;
    cylinderHeight: number;
    frustumTopRadius: number;
    frustumBottomRadius: number;
    frustumHeight: number;
    totalVolumeCm3: number;
    defaultPreSpinMs: number;
    defaultPostSpinMs: number;
    defaultFeedMs: number;
  } | null;
  
  // Connection
  esp8266Connected: boolean;
  proxyConnected: boolean;
  lastUpdate: number;
}
```

**Step 2: Update context value to remove relay/motorOpened, add motor controls**

Remove from context: `toggleRelay`, relay state, motorOpened.

Add to context:
```typescript
startFeed: (params: {
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}) => void;
stopFeed: () => void;
clearJam: (speed?: number, duration?: number) => void;
```

---

### Task 9: App — Update WebSocket Hook

**Files:**
- Modify: `hooks/useWebSocket.ts`

**Step 1: No structural changes needed**

The WebSocket hook is a generic connection manager. It already handles connect/disconnect/reconnect/keepalive. No protocol-specific changes needed. Verify that the hook still works with the server.

**Step 2: Review for no-useEffect violations**

The `useWebSocket.ts` likely uses `useEffect` for connection lifecycle. Per no-use-effect skill, this is acceptable for WebSocket connections (external system integration) — but verify the hook doesn't use `useEffect` for derived state or data fetching.

---

### Task 10: App — Update Context (useESP8266Context)

**Files:**
- Modify: `hooks/useESP8266Context.tsx`

**Step 1: Add new action handlers**

Replace `toggleRelay` handler with:

```typescript
const startFeed = useCallback((params: {
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}) => {
  if (!isConnected || !websocketRef.current) return;
  websocketRef.current.send(JSON.stringify({
    action: 'start_feed',
    augerSpeed: params.augerSpeed,
    impellerSpeed: params.impellerSpeed,
    preSpinMs: params.preSpinMs,
    feedMs: params.feedMs,
    postSpinMs: params.postSpinMs,
  }));
}, [isConnected]);

const stopFeed = useCallback(() => {
  if (!isConnected || !websocketRef.current) return;
  websocketRef.current.send(JSON.stringify({ action: 'stop_feed' }));
}, [isConnected]);

const clearJam = useCallback((speed?: number, duration?: number) => {
  if (!isConnected || !websocketRef.current) return;
  websocketRef.current.send(JSON.stringify({
    action: 'clear_jam',
    speed: speed || 768,
    duration: duration || 2000,
  }));
}, [isConnected]);
```

**Step 2: Update sensor_data message handler**

```typescript
case 'sensor_data':
  setDeviceData(prev => ({
    ...prev,
    temperature: data.temperature,
    distance: data.distance,
    foodLevelPercentage: data.foodLevelPercentage,
    temperatureSensorConnected: data.temperatureSensorConnected,
    ultrasonicSensorConnected: data.ultrasonicSensorConnected,
    motorState: data.motorState || 'idle',
    augerSpeed: data.augerSpeed || 0,
    impellerSpeed: data.impellerSpeed || 0,
    lastUpdate: Date.now(),
  }));
  break;
```

**Step 3: Update status message handler**

```typescript
case 'status':
  if (data.feederConfig) {
    setDeviceData(prev => ({
      ...prev,
      feederConfig: data.feederConfig,
    }));
  }
  if (data.esp8266Connected !== undefined) {
    setEsp8266Status(prev => ({
      ...prev,
      connected: data.esp8266Connected,
      connecting: data.esp8266Connecting || false,
    }));
  }
  break;
```

**Step 4: Remove old toggleRelay and relay-related state**

Remove `relayState`, `motorOpened`, `toggleRelay` from context and DeviceData.

---

### Task 11: App — Update Dashboard Screen

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Step 1: Update motor status card**

Replace the relay status indicators with motor state visualization:

```tsx
<StatCard
  title="Motor Status"
  icon={deviceData.motorState === 'idle' ? 'pause-circle' : 'play-circle'}
  color={deviceData.motorState === 'idle' ? Colors.light.secondary : Colors.light.accent}
>
  <ThemedText>
    State: {deviceData.motorState.replace('_', ' ')}
  </ThemedText>
  {deviceData.motorState !== 'idle' && (
    <>
      <ThemedText>Auger: {Math.round(deviceData.augerSpeed / 10.23)}%</ThemedText>
      <ThemedText>Impeller: {Math.round(deviceData.impellerSpeed / 10.23)}%</ThemedText>
    </>
  )}
</StatCard>
```

**Step 2: Fix WiFi signal indicator**

Currently shows static "Strong". Request RSSI from ESP8266. In firmware, add `WiFi.RSSI()` to `sendDeviceStatus()` response. Then display dBm value:

```tsx
<StatCard title="WiFi Signal" icon="wifi" color={Colors.light.secondary}>
  <ThemedText>
    {wifiSignal} dBm {wifiSignal > -50 ? '(Excellent)' : wifiSignal > -70 ? '(Good)' : '(Weak)'}
  </ThemedText>
</StatCard>
```

**Step 3: Verify data validation ranges**

Temperature -40 to 85°C, distance 0-400cm, foodLevel 0-100%. Keep these.

---

### Task 12: App — Rewrite Controls Screen

**Files:**
- Modify: `app/(tabs)/controls.tsx`

**Step 1: Build new controls layout**

The controls screen needs:
1. Auger speed slider (0-100%, maps to 0-1023)
2. Impeller speed slider (0-100%, maps to 0-1023)
3. Feed duration input (seconds, default 3, max 30)
4. Pre-spin duration input (seconds, default 1.5)
5. Post-spin duration input (seconds, default 1.5)
6. **FEED** button (green, large, prominent)
7. **STOP** button (red, visible when feeding)
8. **CLEAR JAM** button (amber, with confirmation dialog)
9. Connection status warning when offline

**Step 2: State management (no useEffect)**

Use local state via `useState` for sliders. No `useEffect` needed — values are set by user interaction.

```tsx
const [augerSpeed, setAugerSpeed] = useState(75); // 0-100%
const [impellerSpeed, setImpellerSpeed] = useState(100); // 0-100%
const [feedDuration, setFeedDuration] = useState(3); // seconds
const [preSpinMs, setPreSpinMs] = useState(1.5); // seconds
const [postSpinMs, setPostSpinMs] = useState(1.5); // seconds
const [isFeeding, setIsFeeding] = useState(false);
const [showStopConfirm, setShowStopConfirm] = useState(false);
const [showJamConfirm, setShowJamConfirm] = useState(false);
```

**Step 3: Handle motor state from context**

Derive `isFeeding` from `deviceData.motorState !== 'idle'`:

```tsx
const isFeeding = deviceData.motorState !== 'idle';
```

**Step 4: Feed button handler**

```tsx
const handleFeed = () => {
  if (!isConnected || !esp8266Status.connected) {
    Alert.alert('Cannot Feed', 'Device is not connected.');
    return;
  }
  
  startFeed({
    augerSpeed: Math.round(augerSpeed * 10.23), // 0-100% → 0-1023
    impellerSpeed: Math.round(impellerSpeed * 10.23),
    preSpinMs: Math.round(preSpinMs * 1000),
    feedMs: Math.round(feedDuration * 1000),
    postSpinMs: Math.round(postSpinMs * 1000),
  });
};
```

**Step 5: Motor state progress indicator**

When feeding, show a progress bar indicating which phase:

```
Pre-Spin → [████████████] → Feeding → [████░░░░░░░░] → Post-Spin → Done
```

Calculate progress from `deviceData.motorState` and current timestamps.

**Step 6: Remove old timer/paddle code**

Delete all `TimerControl`, `PaddleControl`, `timerState`, `setInterval` code. The old timer feature is replaced by server-side scheduling. Paddle controls were UI-only and unused.

---

### Task 13: App — Scheduling Screen (New)

**Files:**
- Create: `app/(tabs)/schedule.tsx`
- Modify: `app/(tabs)/_layout.tsx`

**Step 1: Add schedule tab to navigator**

In `app/(tabs)/_layout.tsx`, add a 4th tab:

```tsx
<Tabs.Screen
  name="schedule"
  options={{
    title: 'Schedule',
    tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
  }}
/>
```

**Step 2: Create schedule screen**

Create `app/(tabs)/schedule.tsx` with:
- List of saved schedules (FlatList)
- Add schedule button (floating action button)
- Each schedule shows: label, time, days, enabled toggle
- Swipe to delete
- Tap to edit

**Step 3: API service for schedules**

Create `services/api.ts`:

```typescript
const CLOUD_SERVER = 'https://floyd-feeder.up.railway.app';

export async function fetchSchedules() {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`);
  return res.json();
}

export async function createSchedule(data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSchedule(id: string, data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSchedule(id: string) {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function fetchAlertConfig() {
  const res = await fetch(`${CLOUD_SERVER}/api/alerts/config`);
  return res.json();
}

export async function updateAlertConfig(data: any) {
  const res = await fetch(`${CLOUD_SERVER}/api/alerts/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchFeedHistory(limit = 50) {
  const res = await fetch(`${CLOUD_SERVER}/api/history?limit=${limit}`);
  return res.json();
}
```

---

### Task 14: App — Update Alerts Hook

**Files:**
- Modify: `hooks/useAlerts.ts`

**Step 1: Fetch alert config from server on mount**

Use the API service to fetch `AlertConfig` from `/api/alerts/config`. Use defaults if server unavailable:

```typescript
const DEFAULT_THRESHOLDS = {
  lowFoodPct: 30,
  criticalFoodPct: 10,
  tempMin: 20,
  tempMax: 32,
};
```

**Step 2: Update alert generation**

Replace hardcoded thresholds with configurable values. Use `useState` for thresholds (persisted via API, not local state only).

**Step 3: No useEffect for derived values**

Alert generation should be a function called when deviceData changes — not a `useEffect`. Use `useMemo` to derive alerts from deviceData + thresholds:

```typescript
const alerts = useMemo(() => generateAlerts(deviceData, thresholds), [deviceData, thresholds]);
```

---

### Task 15: App — History Screen Update

**Files:**
- Modify: `app/(tabs)/history.tsx`

**Step 1: Integrate server-side feed history**

The in-memory history (from sensor data) stays as a local log. Add a toggle to also show server-side feed history fetched from `/api/history`.

**Step 2: Feed log display**

Show each feed log entry with:
- Timestamp
- Was it manual or scheduled?
- Duration, speeds
- Success/failure

---

### Task 16: QOL — Fixes & Polish

**Files:**
- Modify: Multiple files

**Step 1: Fix WiFi RSSI**

In firmware `sendDeviceStatus()`: Add `wifiInfo["rssi"] = WiFi.RSSI()`. In app Dashboard: display actual RSSI value instead of static "Strong".

**Step 2: Add error toast system**

Create `components/ui/ErrorToast.tsx`:
- Shows at top of screen on WebSocket errors
- Auto-dismisses after 5s
- Color-coded: red (error), amber (warning)
- Uses Animated for slide-in/slide-out

**Step 3: Fix Express version mismatch**

Root `package.json` has `express: ^5.1.0` — this shouldn't be in an Expo project. Remove it. Server keeps its own `express: ^4.18.2`.

**Step 4: Fix millis() overflow in firmware**

`millis()` overflows after ~50 days. Add overflow-safe comparison:

```cpp
unsigned long elapsedSince(unsigned long since) {
  unsigned long now = millis();
  if (now >= since) return now - since;
  // Overflow occurred
  return (0xFFFFFFFF - since) + now + 1;
}
```

Replace all `millis() - startTime` in firmware with `elapsedSince(startTime)`.

**Step 5: Add feed duration safety limit constant visibility**

Export `MIN_FEED_MS` and `MAX_FEED_MS` in device status response so the app can enforce the same limits client-side.

**Step 6: Remove hardcoded WiFi credentials warning**

Add comment block at top of `.ino`:
```cpp
// SECURITY: Configure WiFi credentials below
// TODO: Move to EEPROM or WiFiManager for production
```

**Step 7: Verify type consistency**

Ensure `SensorData` types match between:
- `server/src/types/index.ts`
- `hooks/useESP8266Context.tsx`
- `server/src/websocket/proxyHandlers.ts`

---

### Task 17: Documentation Updates

**Files:**
- Modify: `ESP8266_Setup_Guide.md`
- Modify: `server/README.md`
- Modify: `ESP8266_Pin_Layout_Optimization.md`
- Create: `docs/hardware/wiring-diagram.md`

**Step 1: Update pin layout documentation**

Update `ESP8266_Pin_Layout_Optimization.md` to reflect L298N pin assignments.

**Step 2: Update setup guide**

Update `ESP8266_Setup_Guide.md` with:
- L298N wiring diagram
- Motor connections
- New WebSocket protocol commands
- Feeding sequence explanation

**Step 3: Create wiring diagram document**

Create `docs/hardware/wiring-diagram.md` with ASCII art or table showing all connections.

**Step 4: Update server README**

Update `server/README.md` to remove MQTT references, add scheduling and Prisma setup instructions.

---

### Task 18: Verification & Testing

**Files:**
- Verify all

**Step 1: Type check server**

```bash
cd server && npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Type check app**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 3: Lint**

```bash
npx eslint .
```

Expected: 0 errors or only pre-existing warnings.

**Step 4: Verify firmware compiles**

Open `ESP8266_WebSocket_Server.ino` in Arduino IDE, select ESP8266 board, click Verify.

Expected: Compilation success.

**Step 5: Prisma migrate**

```bash
cd server && npx prisma migrate dev --name init
```

Expected: Migration successful, `floyd.db` created.

**Step 6: Server starts without errors**

```bash
cd server && npm run dev
```

Expected: Server starts, connects to ESP8266 (or logs waiting), loads schedules.

---

### WebSocket Protocol Reference (Final)

#### Commands (App/Server → ESP8266)

```json
{
  "action": "start_feed",
  "augerSpeed": 768,
  "impellerSpeed": 1023,
  "preSpinMs": 1500,
  "feedMs": 3000,
  "postSpinMs": 1500
}
```

```json
{ "action": "stop_feed" }
```

```json
{
  "action": "clear_jam",
  "speed": 768,
  "duration": 2000
}
```

```json
{ "action": "get_sensors" }
```

```json
{
  "action": "set_sensor_interval",
  "parameters": { "interval": 5000 }
}
```

```json
{
  "action": "set_config",
  "parameters": {
    "cylinderRadius": 10.0,
    "cylinderHeight": 25.4,
    "frustumTopRadius": 10.0,
    "frustumBottomRadius": 5.0,
    "frustumHeight": 15.0
  }
}
```

```json
{ "action": "ping" }
```

#### Responses (ESP8266 → Server → App)

```json
{
  "type": "sensor_data",
  "data": {
    "temperature": 24.5,
    "temperatureSensorConnected": true,
    "distance": 8.2,
    "foodLevelPercentage": 85.5,
    "ultrasonicSensorConnected": true,
    "motorState": "feeding",
    "augerSpeed": 768,
    "impellerSpeed": 1023
  },
  "timestamp": 123456789
}
```

```json
{
  "type": "control_response",
  "data": {
    "action": "start_feed",
    "success": true,
    "motorState": "pre_spin"
  },
  "timestamp": 123456789
}
```

```json
{
  "type": "control_response",
  "data": {
    "action": "feed_complete",
    "success": true,
    "motorState": "idle"
  },
  "timestamp": 123456789
}
```

---

### Feeding Sequence State Machine

```
                    ┌──────────────────────────────────┐
                    │           STATE_IDLE              │
                    │  Both motors stopped              │
                    └──────┬───────────────────────────┘
                           │ start_feed command
                           ▼
                    ┌──────────────────────────────────┐
                    │         STATE_PRE_SPIN           │
                    │  Impeller ON, Auger OFF          │
                    │  Duration: preSpinMs (1-2s)      │
                    └──────┬───────────────────────────┘
                           │ preSpinMs elapsed
                           ▼
                    ┌──────────────────────────────────┐
                    │         STATE_FEEDING            │
                    │  Impeller ON, Auger ON           │
                    │  Duration: feedMs                │
                    └──────┬───────────────────────────┘
                           │ feedMs elapsed
                           ▼
                    ┌──────────────────────────────────┐
                    │        STATE_POST_SPIN           │
                    │  Impeller ON, Auger OFF          │
                    │  Duration: postSpinMs (1-2s)     │
                    └──────┬───────────────────────────┘
                           │ postSpinMs elapsed
                           ▼
                    ┌──────────────────────────────────┐
                    │           STATE_IDLE              │
                    │  Both motors stopped              │
                    │  → send feed_complete             │
                    └──────────────────────────────────┘

  Emergency stop (stop_feed or error): any state → STATE_STOPPING → STATE_IDLE
  Jam clear: STATE_IDLE → STATE_JAM_CLEAR → STATE_IDLE
```

---

### REST API Reference (Cloud Server)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health + ESP8266 status |
| GET | `/stats` | Proxy statistics |
| GET | `/api/clients` | Connected mobile clients |
| GET | `/api/config` | Server configuration |
| GET | `/api/schedules` | List all feed schedules |
| POST | `/api/schedules` | Create new schedule |
| PUT | `/api/schedules/:id` | Update schedule |
| DELETE | `/api/schedules/:id` | Delete schedule |
| GET | `/api/history` | Get feed history logs |
| GET | `/api/alerts/config` | Get alert thresholds |
| PUT | `/api/alerts/config` | Update alert thresholds |
| POST | `/api/command` | Send raw command to ESP8266 |
| POST | `/api/esp8266/connect` | Initiate ESP8266 connection |
| POST | `/api/esp8266/reconnect` | Force reconnect |

---

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| GPIO0 (D3) boot mode conflict | IN3 defaults LOW at boot = motor off. Safe. |
| GPIO15 (D8) boot mode conflict | IN4 defaults LOW at boot = motor off. Safe. |
| GPIO16 (D0) no PWM | Used only as direction pin (digital HIGH/LOW). Correct. |
| GPIO2 (D4) boot mode | Has 4.7kΩ pull-up (DS18B20). Safe with OneWire. |
| millis() overflow at ~50 days | `elapsedSince()` wrapper in firmware. |
| SQLite on Railway (ephemeral) | Railway persistent volumes if needed. For now, ephemeral is OK. |
| Schedule drift (cron) | node-cron is reliable. Server uptime determines accuracy. |
| Motor stall detection | No feedback sensor. Add timeout detection in future iteration. |
