# Cloud MQTT Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Floyd Fish Feeder from WebSocket proxy architecture to MQTT-based cloud IoT, with in-app SoftAP WiFi provisioning.

**Architecture:** ESP32 and mobile app both connect to HiveMQ Cloud MQTT broker. ESP publishes telemetry and subscribes to commands. App subscribes to telemetry and publishes commands. Express server handles REST API, cron scheduler, and persists data — but no longer proxies real-time messages.

**Tech Stack:** ESP32 (Arduino, EspMQTTClient, WiFiManager with EEPROM custom params), Node.js/Express/Prisma/mqtt.js (server), React Native/Expo/TypeScript/mqtt.js v5.9+ with native timer (app), HiveMQ Cloud Serverless free tier (broker)

## Known Limitations (from research)

| Limitation | Detail |
|---|---|
| **PubSubClient on ESP32 is unreliable** | Frequent disconnects, keepalive timeout bugs, reconnection loops. Use `EspMQTTClient` wrapper instead. |
| **Never publish inside MQTT callback** | Causes crashes on ESP32. Set flags and publish in main `loop()`. |
| **mqtt.js timerVariant** | Must set `timerVariant: 'native'` for React Native + Hermes engine. Without it, "Keepalive timeout" errors occur. |
| **process.nextTick polyfill** | May be needed for RN. Source: `setTimeout(callback, 0)`. |
| **HiveMQ free tier** | 100 connections, 10GB/month, no SLA. Adequate for single device. Basic auth rules are user-configured in HiveMQ console. |
| **WiFiManager EEPROM for custom params** | Not built-in. Must manually extend EEPROMConfig struct. |
| **WebView ↔ RN communication** | Use `window.ReactNativeWebView.postMessage()` + `onMessage` prop for bidrectional data. |

---

## Table of Tasks

| # | Component | Description |
|---|---|---|
| 1 | Server | Add `mqtt` dependency and Device model |
| 2 | Server | Create MQTT client service |
| 3 | Server | Refactor feed scheduler to use MQTT |
| 4 | Server | Add device claim endpoint |
| 5 | Server | Remove WebSocket proxy and ESP32Client |
| 6 | Server | Clean up types and config |
| 7 | Firmware | Replace WebSocket server with EspMQTTClient |
| 8 | Firmware | Add SoftAP provisioning with custom MQTT params |
| 9 | Firmware | Wire MQTT into command handler, sensor broadcast, and loop |
| 10 | App | Add `mqtt.js` v5.9+ with RN-required options and useMQTT hook |
| 11 | App | Refactor useESP32Context for MQTT |
| 12 | App | Create provisioning screen with WebView↔RN communication |
| 13 | App | Update services/api.ts for device claim |
| 14 | Integration | End-to-end wiring and smoke test |

---

### Task 1: Server — Add `mqtt` dependency and Device model

**Files:**
- Modify: `server/package.json`
- Modify: `server/prisma/schema.prisma`

**Step 1: Install mqtt.js**

Run: `npm install mqtt` in `server/` directory.

**Step 2: Add Device model to Prisma schema**

```prisma
model Device {
  id           String   @id @default(uuid())
  chipId       String   @unique
  name         String
  mqttPassword String
  claimedAt    DateTime @default(now())
}
```

**Step 3: Run Prisma migration**

```bash
npx prisma migrate dev --name add-device-model
```

**Step 4: Commit**

```bash
git add server/package.json server/package-lock.json server/prisma/
git commit -m "feat: add mqtt dependency and Device model to server"
```

---

### Task 2: Server — Create MQTT client service

**Files:**
- Create: `server/src/services/mqttClient.ts`

**Step 1: Write the MQTT client service**

Create a singleton MQTT client that:
- Connects to HiveMQ broker (configurable via env vars)
- Exposes `publishDevice()` and `subscribeDevice()` helpers
- Publishes feed commands to `floyd/devices/{chipId}/command`
- Subscribes to `floyd/devices/{chipId}/telemetry` and `floyd/devices/{chipId}/response` for logging
- Logs feed completions to FeedLog table upon receiving `feed_complete` response

```typescript
import mqtt, { MqttClient } from 'mqtt';
import prisma from './db';

class MQTTHandler {
  private client: MqttClient | null = null;
  private brokerUrl: string;

  constructor() {
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
  }

  async connect(): Promise<void> {
    return new Promise((resolve) => {
      this.client = mqtt.connect(this.brokerUrl, {
        clientId: `floyd-server-${Date.now()}`,
        clean: true,
      });
      this.client.on('connect', () => {
        console.log('[MQTT] Connected to broker');
        resolve();
      });
    });
  }

  publishDevice(chipId: string, topic: string, payload: object): void {
    if (!this.client) return;
    const fullTopic = `floyd/devices/${chipId}/${topic}`;
    this.client.publish(fullTopic, JSON.stringify(payload));
    console.log(`[MQTT] Published to ${fullTopic}`);
  }

  subscribeToTelemetry(chipId: string): void {
    if (!this.client) return;
    const topic = `floyd/devices/${chipId}/response`;
    this.client.subscribe(topic);
    this.client.on('message', async (t, message) => {
      if (t === topic) {
        const data = JSON.parse(message.toString());
        if (data.data?.action === 'feed_complete') {
          await prisma.feedLog.create({
            data: { feedMs: data.data.feedMs || 3000, augerSpeed: data.data.augerSpeed || 768, impellerSpeed: data.data.impellerSpeed || 1023, success: true },
          });
          console.log('[MQTT] Feed log created');
        }
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.endAsync();
      this.client = null;
    }
  }
}

const mqttHandler = new MQTTHandler();
export default mqttHandler;
```

**Step 2: Commit**

```bash
git add server/src/services/mqttClient.ts
git commit -m "feat: add MQTT client service for device communication"
```

---

### Task 3: Server — Refactor feed scheduler to use MQTT

**Files:**
- Modify: `server/src/services/scheduler.ts`

**Step 1: Replace ESP32Client dependency with MQTT**

Change the scheduler to import `mqttHandler` and call `mqttHandler.publishDevice(chipId, 'command', {...})` instead of `this.espClient.sendCommand(...)`.

Key changes:
- Replace `ESP32Client` import with `mqttHandler` import
- Remove `espClient` constructor parameter
- Change `this.espClient.sendCommand(...)` → `mqttHandler.publishDevice(chipId, 'command', { action: 'start_feed', parameters: {...} })`
- The `chipId` should be fetched from the Device table or passed in

```typescript
import cron from 'node-cron';
import prisma from './db';
import mqttHandler from './mqttClient';

interface ScheduledFeed {
  id: string;
  label: string;
  enabled: boolean;
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

  async start(deviceChipId: string) {
    console.log('[Scheduler] Loading schedules from database...');
    const schedules = await prisma.feedSchedule.findMany({ where: { enabled: true } });
    for (const schedule of schedules) {
      this.addJob(schedule, deviceChipId);
    }
    console.log(`[Scheduler] Loaded ${this.jobs.size} schedules`);
  }

  addJob(schedule: ScheduledFeed, chipId: string) {
    if (!schedule.enabled) return;
    const [hour, minute] = schedule.time.split(':').map(Number);
    if (isNaN(hour) || isNaN(minute)) return;
    const cronExpr = `${minute} ${hour} * * ${schedule.daysOfWeek}`;

    const task = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Running scheduled feed: ${schedule.label}`);
      if (!chipId) {
        await prisma.feedLog.create({
          data: { feedMs: schedule.feedMs, augerSpeed: schedule.augerSpeed, impellerSpeed: schedule.impellerSpeed, success: false, errorMessage: 'No device configured' },
        });
        return;
      }
      try {
        mqttHandler.publishDevice(chipId, 'command', {
          action: 'start_feed',
          parameters: {
            augerSpeed: schedule.augerSpeed,
            impellerSpeed: schedule.impellerSpeed,
            preSpinMs: schedule.preSpinMs,
            feedMs: schedule.feedMs,
            postSpinMs: schedule.postSpinMs,
          },
          timestamp: Date.now(),
        });
        await prisma.feedLog.create({
          data: { feedMs: schedule.feedMs, augerSpeed: schedule.augerSpeed, impellerSpeed: schedule.impellerSpeed, success: true },
        });
      } catch (err: any) {
        console.error(`[Scheduler] Feed failed: ${err.message}`);
        await prisma.feedLog.create({
          data: { feedMs: schedule.feedMs, augerSpeed: schedule.augerSpeed, impellerSpeed: schedule.impellerSpeed, success: false, errorMessage: err.message },
        });
      }
    });

    this.jobs.set(schedule.id, task);
  }

  addJobStatic(schedule: ScheduledFeed, chipId: string) {
    this.addJob(schedule, chipId);
  }

  removeJob(id: string) {
    const job = this.jobs.get(id);
    if (job) { job.stop(); this.jobs.delete(id); }
  }

  stop() {
    for (const [, job] of this.jobs) { job.stop(); }
    this.jobs.clear();
  }
}

export default FeedScheduler;
```

**Step 2: Commit**

```bash
git add server/src/services/scheduler.ts
git commit -m "refactor: feed scheduler uses MQTT instead of ESP32Client"
```

---

### Task 4: Server — Add device claim endpoint

**Files:**
- Modify: `server/src/server.ts`

**Step 1: Add POST /api/devices/claim**

```typescript
// Add to setupExpress() method

this.app.post("/api/devices/claim", asyncHandler(async (req, res) => {
  const { deviceId, deviceName, mqttPassword } = req.body;
  if (!deviceId || !mqttPassword) {
    res.status(400).json({ success: false, error: 'deviceId and mqttPassword required' });
    return;
  }

  const existing = await prisma.device.findUnique({ where: { chipId: deviceId } });
  if (existing) {
    // Re-claim: update password and name
    const updated = await prisma.device.update({
      where: { id: existing.id },
      data: { name: deviceName || existing.name, mqttPassword, claimedAt: new Date() },
    });
    res.json({ success: true, device: updated });
    return;
  }

  const device = await prisma.device.create({
    data: { chipId: deviceId, name: deviceName || 'Floyd Feeder', mqttPassword },
  });

  // Subscribe to telemetry for this device
  mqttHandler.subscribeToTelemetry(deviceId);

  res.status(201).json({ success: true, device });
}));

this.app.get("/api/devices", asyncHandler(async (_req, res) => {
  const devices = await prisma.device.findMany({ orderBy: { claimedAt: 'desc' } });
  res.json({ success: true, devices });
}));
```

**Step 2: Import mqttHandler in server.ts**

Add `import mqttHandler from './services/mqttClient';` at top.

**Step 3: Initialize MQTT on server start**

In the `start()` method, call `await mqttHandler.connect();` before the server listen.

**Step 4: Commit**

```bash
git add server/src/server.ts
git commit -m "feat: add device claim endpoint and MQTT init on server start"
```

---

### Task 5: Server — Remove WebSocket proxy and ESP32Client

**Files:**
- Delete: `server/src/services/esp32Client.ts`
- Delete: `server/src/websocket/proxyHandlers.ts`
- Modify: `server/src/server.ts` (remove WebSocket setup and proxy references)

**Step 1: Remove WebSocket imports and proxy references from server.ts**

Remove:
- `import { createServer } from "http";`
- `import WebSocket, { WebSocketServer } from "ws";`
- `import { ESP32Client } from "./services/esp32Client";`
- `import { WebSocketProxyHandler } from "./websocket/proxyHandlers";`
- The `wss` field and all its usages
- The `esp32Client` and `wsProxyHandler` fields
- The `setupWebSocket()` private method
- ESP32-specific REST endpoints (`/api/esp32/*`, `/api/command`, `/api/clients`)
- Update `/health` and `/stats` to remove ESP32/proxy references
- Update the `start()` method to not call `this.esp32Client.connect()` or `this.setupWebSocket()`
- Update `stop()` to not call `this.wsProxyHandler.shutdown()` or close `wss`

Keep:
- Express app, REST API routes (schedules, history, alerts), Prisma
- FeedScheduler (now refactored)
- CORS, JSON parsing

**Step 2: Delete removed files**

```bash
rm server/src/services/esp32Client.ts
rm -r server/src/websocket/
```

**Step 3: Remove `ws` and `uuid` dependencies (if no longer needed)**

Run: `npm uninstall ws uuid` and `npm uninstall @types/ws @types/uuid`

**Step 4: Commit**

```bash
git add -A server/
git commit -m "refactor: remove WebSocket proxy and ESP32Client; server is API+cron only"
```

---

### Task 6: Server — Clean up types and config

**Files:**
- Modify: `server/src/types/index.ts`

**Step 1: Remove proxy-specific types and configs**

Remove:
- `ClientInfo` (no longer tracking app clients on server)
- `ESP32Config` and `DEFAULT_ESP32_CONFIG` (no more ESP32 connection config)
- Update `ServerConfig` to remove `esp32Config` field
- Update `DEFAULT_SERVER_CONFIG` to remove `esp32Config`

Keep all message protocol types (`MessageType`, `CommandAction`, `DeviceCommand`, `SensorData`, etc.).

**Step 2: Add environment variable for MQTT config**

Add MQTT config constants:
```typescript
export const MQTT_CONFIG = {
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883',
} as const;
```

**Step 3: Commit**

```bash
git add server/src/types/index.ts
git commit -m "refactor: remove proxy types, add MQTT config constants"
```

---

### Task 7: Firmware — Replace WebSocket server with EspMQTTClient

> **Why EspMQTTClient:** Raw PubSubClient on ESP32 has documented reliability issues — keepalive timeout bugs, failed reconnections after disconnect, and crashes when publishing from callback (GitHub issues #243, #795, #825). EspMQTTClient wraps PubSubClient with proper reconnection logic, connection state tracking, and WiFi monitoring. It also calls `loop()` internally so you don't need to manage timing.

**Files:**
- Modify: `ESP32_WebSocket_Server.ino`

**Step 1: Replace WebSocket library with EspMQTTClient**

Remove:
```cpp
#include <WebSocketsServer.h>
```
Add:
```cpp
#include <EspMQTTClient.h>
```

**Step 2: Replace WebSocket globals with EspMQTTClient**

Remove:
```cpp
WebSocketsServer webSocket = WebSocketsServer(81);
```
Add:
```cpp
// MQTT topics — built from chipId after setup
String topicCommand;
String topicTelemetry;
String topicStatus;
String topicResponse;

// EspMQTTClient handles WiFi monitoring + MQTT reconnection internally
// Constructor params: SSID, password, broker IP, broker port, clientId
// SSID/password initially empty — set from EEPROM after first provisioning
EspMQTTClient mqttClient(
  "",             // WiFi SSID (loaded from EEPROM in setup)
  "",             // WiFi password
  "broker.hivemq.com",  // MQTT broker
  1883,           // MQTT port
  ""              // MQTT username (blank for HiveMQ free tier)
  // clientId set via mqttClient.setMqttClientId() in setup
  // password set via mqttClient.setMqttPassword() in setup
);

// Flag pattern: NEVER publish inside callback on ESP32
volatile bool pendingCommand = false;
String pendingCommandPayload = "";

// Device identity
String deviceChipId = String(ESP.getChipId(), HEX);
String mqttPassword = ""; // generated during provisioning
String mqttClientId = "floyd-" + deviceChipId;

void setupMQTTTopics() {
  topicCommand = "floyd/devices/" + deviceChipId + "/command";
  topicTelemetry = "floyd/devices/" + deviceChipId + "/telemetry";
  topicStatus = "floyd/devices/" + deviceChipId + "/status";
  topicResponse = "floyd/devices/" + deviceChipId + "/response";
}

// MQTT connection callback — subscribe to command topic
void onConnectionEstablished() {
  mqttClient.subscribe(topicCommand, [](const String &topic, const String &payload) {
    // CRITICAL: Set flag, do NOT process here (ESP32 crash if publish from callback)
    pendingCommandPayload = payload;
    pendingCommand = true;
  });

  // Publish online status with retain flag
  StaticJsonDocument<128> statusDoc;
  statusDoc["type"] = "status";
  statusDoc["data"]["connected"] = true;
  String output;
  serializeJson(statusDoc, output);
  mqttClient.publish(topicStatus, output, true); // retain
}
```

**Step 3: Commit**

```bash
git add ESP32_WebSocket_Server.ino
```

---

### Task 8: Firmware — Add SoftAP provisioning with custom MQTT params

> **Why WiFiManager custom params:** The captive portal page needs to show the device chip ID and allow entering WiFi credentials. WiFiManager's `WiFiManagerParameter` API allows adding custom fields to the captive portal form AND injecting custom HTML. EEPROM save/load for custom params is manual — must extend the existing `EEPROMConfig` struct.

**Files:**
- Modify: `ESP32_WebSocket_Server.ino`

**Step 1: Add WiFiManager dependency**

```cpp
#include <WiFiManager.h>
```

**Step 2: Extend EEPROMConfig struct to include WiFi + MQTT credentials**

Replace the existing `EEPROMConfig` struct:

```cpp
struct EEPROMConfig {
  // Container geometry (existing)
  float cylinderRadius;
  float cylinderHeight;
  float frustumTopRadius;
  float frustumBottomRadius;
  float frustumHeight;
  unsigned long sensorInterval;

  // NEW: WiFi provisioning
  char wifiSSID[33];       // max SSID length
  char wifiPassword[65];   // max WPA2 password length

  // NEW: MQTT credentials
  char mqttBroker[64];     // broker hostname
  char mqttPassword[33];   // random hex string
  bool provisioned;        // true after first successful setup

  uint8_t checksum;
};

// Global buffers to hold loaded values
char savedSSID[33] = "";
char savedPassword[65] = "";
```

**Step 3: Add save/load functions for WiFi + MQTT data**

```cpp
void saveCredentials() {
  EEPROMConfig config;
  // Load existing geometry values first
  EEPROM.get(0, config);

  // Update with new WiFi + MQTT values
  strncpy(config.wifiSSID, savedSSID, 32);
  config.wifiSSID[32] = '\0';
  strncpy(config.wifiPassword, savedPassword, 64);
  config.wifiPassword[64] = '\0';
  strncpy(config.mqttBroker, "broker.hivemq.com", 63);
  config.mqttBroker[63] = '\0';
  strncpy(config.mqttPassword, mqttPassword.c_str(), 32);
  config.mqttPassword[32] = '\0';
  config.provisioned = true;

  // Simple checksum
  config.checksum = (uint8_t)(
    (int)config.cylinderRadius + (int)config.cylinderHeight +
    (int)config.frustumTopRadius + (int)config.frustumBottomRadius +
    (int)config.frustumHeight + (int)config.sensorInterval +
    strlen(config.wifiSSID) + strlen(config.wifiPassword) +
    strlen(config.mqttBroker) + strlen(config.mqttPassword) +
    (config.provisioned ? 1 : 0)
  ) & 0xFF;

  EEPROM.put(0, config);
  EEPROM.commit();
}

bool loadCredentials() {
  EEPROM.begin(sizeof(EEPROMConfig));
  EEPROMConfig config;
  EEPROM.get(0, config);

  // Validate checksum
  uint8_t sum = (uint8_t)(
    (int)config.cylinderRadius + (int)config.cylinderHeight +
    (int)config.frustumTopRadius + (int)config.frustumBottomRadius +
    (int)config.frustumHeight + (int)config.sensorInterval +
    strlen(config.wifiSSID) + strlen(config.wifiPassword) +
    strlen(config.mqttBroker) + strlen(config.mqttPassword) +
    (config.provisioned ? 1 : 0)
  ) & 0xFF;

  if (sum == config.checksum && config.provisioned) {
    strncpy(savedSSID, config.wifiSSID, 32);
    strncpy(savedPassword, config.wifiPassword, 64);
    mqttPassword = String(config.mqttPassword);
    // Restore geometry (existing functionality)
    cylinderRadius = config.cylinderRadius;
    cylinderHeight = config.cylinderHeight;
    frustumTopRadius = config.frustumTopRadius;
    frustumBottomRadius = config.frustumBottomRadius;
    frustumHeight = config.frustumHeight;
    sensorInterval = config.sensorInterval;
    Serial.println("Loaded credentials from EEPROM");
    return true;
  }
  Serial.println("No saved credentials found");
  return false;
}
```

**Step 4: Add provisioning mode using WiFiManager with custom params**

```cpp
#include <WiFiManager.h>

void startProvisioningMode() {
  WiFiManager wifiManager;

  // Custom parameters for the captive portal
  // id, placeholder, default value, max length
  WiFiManagerParameter custom_device_id("deviceId", "Device ID", deviceChipId.c_str(), 20);
  custom_device_id.setValue(deviceChipId.c_str(), 20); // pre-fill, read-only

  // Inject custom HTML to show device ID and instructions
  wifiManager.setCustomHeadElement(
    "<style>"
    "  button { background: #2e7d32 !important; }"
    "</style>"
    "<p>Floyd Fish Feeder Setup</p>"
  );

  wifiManager.addParameter(&custom_device_id);

  // Set portal timeout (30 sec) and AP name
  wifiManager.setConfigPortalTimeout(120);
  wifiManager.setConnectTimeout(30);

  String apName = "FloydFeeder-" + deviceChipId;

  // Show captive portal — autoConnect blocks until user saves or times out
  if (!wifiManager.autoConnect(apName.c_str())) {
    Serial.println("Provisioning timed out, restarting...");
    delay(3000);
    ESP.restart();
  }

  // User submitted the form — read saved values
  strncpy(savedSSID, WiFi.SSID().c_str(), 32);
  strncpy(savedPassword, WiFi.psk().c_str(), 64);

  // Generate random MQTT password (8 hex chars)
  mqttPassword = String(random(0x10000000, 0x7FFFFFFF), HEX);

  // Save to EEPROM
  saveCredentials();

  Serial.println("Provisioning complete! WiFi=" + WiFi.SSID() + " MQTT password=" + mqttPassword);

  // ESP will restart in setup flow — MQTT connects on next boot
  delay(1000);
  ESP.restart();
}
```

**Step 5: Update setup() for dual-mode boot**

```cpp
void setup() {
  // ... existing Serial, pin init, sensor init ...

  setupMQTTTopics();

  // Load geometry + credentials from EEPROM
  if (!loadCredentials()) {
    // Also try old geometry-only format (existing loadConfig fallback)
    loadConfig();
  }

  totalVolumeCm3 = computeTotalVolume();

  // If provisioned, try to connect with saved WiFi
  if (savedSSID[0] != '\0') {
    WiFi.begin(savedSSID, savedPassword);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      Serial.print(".");
      attempts++;
      ESP.wdtFeed();
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());

    // Configure EspMQTTClient with saved credentials
    mqttClient.enableMQTTPersistence();
    mqttClient.enableLastWillMessage(topicStatus.c_str(), R"({"type":"status","data":{"connected":false}})", true);

    // Use WiFiManager-set credentials
    // Note: EspMQTTClient uses the WiFi it was given; after WiFiManager, WiFi is already connected
    // We need to reconfigure EspMQTTClient at this point
    // For this we use the enable* methods after WiFi is up
  } else {
    // No saved WiFi or connection failed — start provisioning
    Serial.println("No WiFi. Starting provisioning mode...");
    startProvisioningMode();
  }
}
```

**Step 6: Commit**

```bash
git add ESP32_WebSocket_Server.ino
git commit -m "feat: add SoftAP provisioning with WiFiManager and EEPROM credential storage"
```

---

### Task 9: Firmware — Wire MQTT into command handler, sensor broadcast, and loop

> **Critical rule:** NEVER call `mqttClient.publish()` inside the MQTT callback. On ESP32 this causes crashes. Instead, set a `volatile` flag and publish in the main `loop()`. Also, EspMQTTClient already calls its own internal `loop()` — you don't need to manage it.

**Files:**
- Modify: `ESP32_WebSocket_Server.ino`

**Step 1: Refactor command handler for MQTT (no `num` parameter)**

The message handler stays identical — it parses JSON and dispatches by `action`. Remove the `num` parameter (no per-client IDs in MQTT). Replace all `webSocket.broadcastTXT(output)` and `webSocket.sendTXT(num, output)` with storing the response to be published in `loop()`:

```cpp
// Response buffer for publishing in main loop (not in callback)
String pendingResponse = "";

void handleMQTTMessage(String message) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    // Store error response for loop() to publish
    StaticJsonDocument<256> errDoc;
    errDoc["type"] = "error";
    errDoc["data"]["message"] = "Invalid JSON";
    serializeJson(errDoc, pendingResponse);
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
    serializeJson(response, pendingResponse);

  } else if (action == "stop_feed") {
    emergencyStop();
    StaticJsonDocument<256> response;
    response["type"] = "control_response";
    JsonObject data = response.createNestedObject("data");
    data["action"] = "stop_feed";
    data["success"] = true;
    data["motorState"] = "idle";
    serializeJson(response, pendingResponse);

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
    serializeJson(response, pendingResponse);

  } else if (action == "get_sensors") {
    readSensors();
    // Queue sensor data for publishing in loop()
    StaticJsonDocument<512> sensorDoc;
    sensorDoc["type"] = "sensor_data";
    JsonObject sdata = sensorDoc.createNestedObject("data");
    if (!isnan(sensors.temperature)) sdata["temperature"] = sensors.temperature;
    if (!isnan(sensors.distance)) {
      sdata["distance"] = sensors.distance;
      sdata["foodLevelPercentage"] = sensors.foodLevelPercentage;
    }
    sdata["motorState"] = /* motor state string */;
    serializeJson(sensorDoc, pendingResponse);

  } else if (action == "set_sensor_interval") {
    // ... existing set_sensor_interval logic ...
    serializeJson(response, pendingResponse);

  } else if (action == "set_config") {
    // ... existing set_config logic ...
    serializeJson(response, pendingResponse);

  } else {
    StaticJsonDocument<256> errDoc;
    errDoc["type"] = "error";
    errDoc["data"]["message"] = "Unknown action: " + action;
    serializeJson(errDoc, pendingResponse);
  }
}
```

**Step 2: Update sensor broadcast to use MQTT**

```cpp
void broadcastSensorDataMQTT() {
  StaticJsonDocument<512> doc;
  doc["type"] = "sensor_data";
  JsonObject data = doc.createNestedObject("data");

  // ... same sensor data as broadcastSensorData() ...

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topicTelemetry, output);
}
```

**Step 3: Update feeding/jam complete callbacks**

Replace `broadcastResponse(doc)` inside `sendFeedingComplete()` and `sendJamClearComplete()`:

```cpp
void sendFeedingComplete() {
  StaticJsonDocument<256> doc;
  doc["type"] = "control_response";
  JsonObject data = doc.createNestedObject("data");
  data["action"] = "feed_complete";
  data["success"] = true;
  data["motorState"] = "idle";

  String output;
  serializeJson(doc, output);
  mqttClient.publish(topicResponse, output);
}
```

**Step 4: Update loop() — process pending flag and publish responses**

```cpp
void loop() {
  ESP.wdtFeed();

  // EspMQTTClient handles its own reconnection + mqtt loop internally
  // No need to call mqttClient.loop() manually

  // Process pending command (set by MQTT callback via flag)
  if (pendingCommand) {
    pendingCommand = false;
    handleMQTTMessage(pendingCommandPayload);
  }

  // Publish any pending response (from handleMQTTMessage)
  if (pendingResponse.length() > 0) {
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
    broadcastSensorDataMQTT();
  }

  delay(10); // Small yield for ESP32 WiFi stack — critical for stability
}
```

**Step 5: Commit**

```bash
git add ESP32_WebSocket_Server.ino
git commit -m "feat: wire EspMQTTClient into command handler and sensor loop"
```

---

### Task 10: App — Add `mqtt.js` v5.9+ with RN-required options and useMQTT hook

> **Why v5.9+:** React Native support was fixed in mqtt.js v5.5.2+. v5.9+ is current stable. **Critical RN options:** `timerVariant: 'native'` (prevents "Keepalive timeout" errors on Hermes engine, ref: issue #1853), `reschedulePings: true`, `keepalive: 30` (lower for mobile network volatility). May also need `process.nextTick` polyfill.

**Files:**
- Create: `hooks/useMQTT.ts`
- Modify: `package.json`

**Step 1: Install mqtt.js v5.9+**

Run: `npm install mqtt@^5.9.0` in project root.

**Step 2: Write useMQTT hook**

Creates an MQTT client that:
- Connects to HiveMQ via MQTTS (port 8883)
- Uses `timerVariant: 'native'` (critical for RN + Hermes)
- Auto-reconnects, auto-resubscribes
- Exposes `publish()`, connection state, lastMessage
- Handles message parsing (same JSON format as existing protocol)

```typescript
import { useCallback, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';

// process.nextTick polyfill for React Native (mqtt.js needs it)
if (typeof process !== 'undefined' && typeof process.nextTick !== 'function') {
  process.nextTick = (callback: () => void) => {
    setTimeout(callback, 0);
  };
}

const BROKER_URL = 'mqtts://broker.hivemq.com:8883';

export interface MQTTMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface MQTTState {
  isConnected: boolean;
  error: string | null;
  lastMessage: MQTTMessage | null;
}

const useMQTT = (deviceChipId: string | null) => {
  const [state, setState] = useState<MQTTState>({
    isConnected: false,
    error: null,
    lastMessage: null,
  });

  const clientRef = useRef<MqttClient | null>(null);
  const chipIdRef = useRef(deviceChipId);
  chipIdRef.current = deviceChipId;

  const connect = useCallback(() => {
    const chipId = chipIdRef.current;
    if (!chipId) return;
    if (clientRef.current) {
      clientRef.current.end();
    }

    const client = mqtt.connect(BROKER_URL, {
      clientId: `floyd-app-${Date.now().toString(36)}`,
      clean: true,
      keepalive: 30,           // 30s for mobile network volatility
      reconnectPeriod: 3000,   // Retry every 3s
      connectTimeout: 20000,   // 20s timeout
      reschedulePings: true,   // Reschedule pings after data sends
      resubscribe: true,       // Auto-resubscribe after reconnect
      timerVariant: 'native',  // CRITICAL: prevents Hermes "Keepalive timeout" bug
      rejectUnauthorized: false, // HiveMQ free tier
    });

    client.on('connect', () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      client.subscribe(`floyd/devices/${chipId}/telemetry`, { qos: 0 });
      client.subscribe(`floyd/devices/${chipId}/status`, { qos: 0 });
      client.subscribe(`floyd/devices/${chipId}/response`, { qos: 0 });
    });

    client.on('message', (_topic: string, message: Buffer) => {
      try {
        const parsed: MQTTMessage = JSON.parse(message.toString());
        setState(prev => ({ ...prev, lastMessage: parsed, error: null }));
      } catch (e) {
        console.error('Failed to parse MQTT message:', e);
      }
    });

    client.on('error', (err: Error) => {
      setState(prev => ({ ...prev, error: err.message }));
    });

    client.on('offline', () => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    client.on('close', () => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    clientRef.current = client;
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setState({ isConnected: false, error: null, lastMessage: null });
  }, []);

  const publish = useCallback((topic: string, payload: object): boolean => {
    const chipId = chipIdRef.current;
    if (!clientRef.current || !clientRef.current.connected || !chipId) return false;
    const fullTopic = `floyd/devices/${chipId}/${topic}`;
    clientRef.current.publish(fullTopic, JSON.stringify(payload), { qos: 0 });
    return true;
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => connect(), 500);
  }, [connect, disconnect]);

  return { ...state, connect, disconnect, publish, reconnect };
};

export default useMQTT;
```

**Step 3: Commit**

```bash
git add hooks/useMQTT.ts package.json package-lock.json
git commit -m "feat: add mqtt.js v5.9+ with RN-native timer variant and useMQTT hook"
```

---

### Task 11: App — Refactor useESP32Context for MQTT

**Files:**
- Modify: `hooks/useESP32Context.tsx`

**Step 1: Replace useWebSocket with useMQTT**

```typescript
// Remove: import useWebSocket, { ConnectionQuality } from "./useWebSocket";
// Add: import useMQTT from "./useMQTT";

// Remove: const CLOUD_SERVER_URL = "wss://floyd-feeder.up.railway.app";

// Replace useWebSocket call:
const deviceChipId = ""; // will be set after provisioning, persisted in AsyncStorage
const {
  isConnected,
  error,
  lastMessage,
  connect: mqttConnect,
  disconnect: mqttDisconnect,
  publish,
} = useMQTT(deviceChipId || null);
```

**Step 2: Replace sendCommand with publish**

All `sendCommand({ action: '...', parameters: {...} })` calls become:
```typescript
publish('command', { action: '...', parameters: {...}, timestamp: Date.now() });
```

**Step 3: Update context interface**

Remove: `connectionQuality`, `latency`, `cloudServerUrl`
Add: `chipId`, `setChipId`, `publishCommand`

**Step 4: Commit**

```bash
git add hooks/useESP32Context.tsx
git commit -m "refactor: useESP32Context uses MQTT instead of WebSocket"
```

---

### Task 12: App — Create provisioning screen with WebView ↔ RN communication

> **WebView communication:** Use `window.ReactNativeWebView.postMessage()` from the provisioning HTML to send device data back to React Native. The `onMessage` prop receives this data. This avoids fragile URL parsing.

**Files:**
- Create: `app/provision.tsx`

**Step 1: Write the provisioning screen**

The provisioning page on the ESP serves a standard HTML form. After WiFiManager completes, the ESP shows a success page. The RN app uses `injectedJavaScript` to add a JavaScript interceptor that captures device info (chipId, mqttPassword) and sends it back via `postMessage`.

```typescript
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { claimDevice } from '@/services/api';
import { useESP32 } from '@/hooks/useESP32Context';
import { router } from 'expo-router';

const ESP_AP_IP = '192.168.4.1';

export default function ProvisionScreen() {
  const [step, setStep] = useState<'connecting' | 'provisioning' | 'claiming' | 'done' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const { setChipId } = useESP32();

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'provisioning-complete') {
        setStep('claiming');
        const { chipId, mqttPassword, deviceName } = data;

        // Call server to claim the device
        const result = await claimDevice(chipId, deviceName || 'Floyd Feeder', mqttPassword);

        if (result.success) {
          // Save chipId locally
          await AsyncStorage.setItem('floydChipId', chipId);
          await AsyncStorage.setItem('floydMqttPassword', mqttPassword);
          setDeviceId(chipId);
          setChipId(chipId); // Trigger MQTT connection in context
          setStep('done');
        } else {
          setStep('error');
          setErrorMsg('Failed to claim device on server');
        }
      }

      if (data.type === 'error') {
        setStep('error');
        setErrorMsg(data.message || 'Provisioning failed');
      }
    } catch {
      setStep('error');
      setErrorMsg('Failed to process provisioning data');
    }
  }, [setChipId]);

  // JavaScript injected into every page loaded in the WebView
  // Intercepts the provisioning flow to extract device info
  const injectedJS = `
    (function() {
      // Show status to user
      document.body.style.fontFamily = 'system-ui, sans-serif';
      document.body.style.padding = '20px';

      // After the ESP WiFiManager form is submitted, the ESP restarts.
      // The WiFiManager success page runs before restart.
      // We intercept by watching for key elements.

      // The ESP doesn't directly expose mqttPassword in the provisioning page.
      // Instead, we read the device ID from the page and send it to RN.
      // The RN app then generates or receives the MQTT password via a separate mechanism.

      // Wait for the page to fully load
      setTimeout(function() {
        var body = document.body.innerText || '';

        // Look for device ID (ESP.getChipId() displayed as 6-char hex)
        var chipIdMatch = body.match(/([A-Fa-f0-9]{6,8})/);
        var chipId = chipIdMatch ? chipIdMatch[1] : '';

        if (chipId) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'device-id-found',
            chipId: chipId
          }));
        }
      }, 2000);
    })();
  `;

  return (
    <View style={styles.container}>
      {step === 'connecting' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2e7d32" />
          <Text style={styles.text}>Connect your phone to FloydFeeder WiFi network</Text>
          <Text style={styles.subtext}>Go to Settings → WiFi → FloydFeeder-XXXX</Text>
        </View>
      )}

      {step === 'provisioning' && (
        <WebView
          source={{ uri: `http://${ESP_AP_IP}` }}
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          onError={() => {
            setStep('error');
            setErrorMsg('Could not reach provisioning portal. Make sure you are connected to the FloydFeeder WiFi.');
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          style={{ flex: 1 }}
        />
      )}

      {step === 'claiming' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2e7d32" />
          <Text style={styles.text}>Claiming device...</Text>
        </View>
      )}

      {step === 'done' && (
        <View style={styles.centered}>
          <Text style={styles.title}>Device Connected!</Text>
          <Text style={styles.text}>Device ID: {deviceId}</Text>
          <Text style={styles.subtext}>Your Floyd Feeder is now online.</Text>
        </View>
      )}

      {step === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.title}>Setup Failed</Text>
          <Text style={styles.text}>{errorMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  text: { fontSize: 16, marginBottom: 8, textAlign: 'center' },
  subtext: { fontSize: 14, color: '#888', textAlign: 'center' },
});
```

**Step 2: Add react-native-webview dependency**

Run: `npm install react-native-webview`

**Step 3: Commit**

```bash
git add app/provision.tsx package.json package-lock.json
git commit -m "feat: add provisioning screen with WebView + postMessage communication"
```

---

### Task 13: App — Update services/api.ts for device claim

**Files:**
- Modify: `services/api.ts`

**Step 1: Add claimDevice function**

```typescript
export async function claimDevice(deviceId: string, deviceName: string, mqttPassword: string) {
  const res = await fetch(`${CLOUD_SERVER}/api/devices/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, deviceName, mqttPassword }),
  });
  return res.json();
}

export async function fetchDevices() {
  const res = await fetch(`${CLOUD_SERVER}/api/devices`);
  return res.json();
}
```

**Step 2: Commit**

```bash
git add services/api.ts
git commit -m "feat: add device claim and list API functions"
```

---

### Task 14: Integration — End-to-end wiring and smoke test

**Files:**
- Modify: `app/_layout.tsx` (update provider)
- Modify: `components/ESP32Connection.tsx` (update status display)

**Step 1: Update _layout.tsx to handle chipId from AsyncStorage**

```typescript
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useESP32 } from '@/hooks/useESP32Context';

// In layout:
const [loading, setLoading] = useState(true);
const [chipId, setChipId] = useState<string | null>(null);

useEffect(() => {
  (async () => {
    const id = await AsyncStorage.getItem('floydChipId');
    setChipId(id);
    setLoading(false);
  })();
}, []);

if (loading) return <SplashScreen />;

// Pass chipId to provider or context
```

**Step 2: Update ESP32Connection component**

Remove the "Connect to Cloud Server" button (auto-connects now). Show MQTT connection status and chipId.

**Step 3: End-to-end smoke test**

1. Flash ESP32 with new firmware (first boot — no saved WiFi)
2. ESP boots into AP mode as `FloydFeeder-XXXX`
3. User connects phone to FloydFeeder-XXXX WiFi AP
4. App provisioning screen → WebView opens WiFiManager captive portal at 192.168.4.1
5. User enters home WiFi credentials → WiFiManager auto-connects ESP to home WiFi
6. ESP reboots → connects to home WiFi using saved SSID
7. ESP auto-connects to HiveMQ as `floyd-<chipId>` (via EspMQTTClient)
8. **Provisioning note:** The MQTT password (generated in EEPROM) must be communicated to the app. Since WiFiManager doesn't expose it in the captive portal by default, the app needs to either:
   - **(Option A)** Read it from the ESP via a secondary HTTP endpoint before the ESP restarts
   - **(Option B)** Derive it deterministically from the chipId + a shared secret
   - **(Option C)** Add it as a WiFiManager custom parameter displayed on the success page, captured via injectedJS in WebView
9. App calls `POST /api/devices/claim` with chipId + mqttPassword
10. Server records device → subscribes to telemetry via MQTT
11. App connects to HiveMQ via MQTTS → subscribes to `floyd/devices/<chipId>/telemetry`
12. App receives sensor data → dashboard updates
13. App sends `start_feed` command → ESP executes → ESP publishes `feed_complete`
14. Cron scheduler fires at configured time → publishes `start_feed` to MQTT → ESP executes

**Step 4: Commit**

```bash
git add app/_layout.tsx components/ESP32Connection.tsx
git commit -m "feat: wire end-to-end MQTT integration with provisioning flow"
```

---

## Environment Variables Summary

### Server (.env on Railway)

```
PORT=3001
DATABASE_URL=file:./prisma/floyd.db
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
MQTT_USERNAME=        (blank — HiveMQ free tier doesn't require)
MQTT_PASSWORD=        (blank — free tier anonymous auth)
```

### HiveMQ Console Setup (one-time)

1. Create account at [console.hivemq.cloud](https://console.hivemq.cloud)
2. Create a Serverless cluster (free)
3. Add an MQTT client credential:
   - **Username:** empty (anonymous for free tier)  
   - **Password:** empty (anonymous)
4. For production: create per-device credentials and use `MQTT_USERNAME`/`MQTT_PASSWORD`

### Removed from server

```
ESP32_HOST          (no longer needed)
ESP32_PORT          (no longer needed)
USE_MQTT              (no longer toggle — always MQTT)
MQTT_USERNAME         (HiveMQ free tier doesn't require)
MQTT_PASSWORD
MQTT_CLIENT_ID
MQTT_TOPIC_PREFIX
```

---

*Plan generated from design doc `docs/plans/2026-04-29-cloud-mqtt-architecture-design.md`*
