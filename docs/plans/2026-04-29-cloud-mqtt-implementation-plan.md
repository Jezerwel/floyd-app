# Cloud MQTT Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Floyd Fish Feeder from WebSocket proxy architecture to MQTT-based cloud IoT, with in-app SoftAP WiFi provisioning.

**Architecture:** ESP8266 and mobile app both connect to HiveMQ Cloud MQTT broker. ESP publishes telemetry and subscribes to commands. App subscribes to telemetry and publishes commands. Express server handles REST API, cron scheduler, and persists data — but no longer proxies real-time messages.

**Tech Stack:** ESP8266 (Arduino, PubSubClient, WiFiManager), Node.js/Express/Prisma (server), React Native/Expo/TypeScript/mqtt.js (app), HiveMQ Cloud (broker)

---

## Table of Tasks

| # | Component | Description |
|---|---|---|
| 1 | Server | Add `mqtt` dependency and Device model |
| 2 | Server | Create MQTT client service |
| 3 | Server | Refactor feed scheduler to use MQTT |
| 4 | Server | Add device claim endpoint |
| 5 | Server | Remove WebSocket proxy and ESP8266Client |
| 6 | Server | Clean up server.ts |
| 7 | Firmware | Add ESP8266 MQTT client (replace WebSocket server) |
| 8 | Firmware | Add SoftAP provisioning mode |
| 9 | Firmware | Wire MQTT into command handler and sensor broadcast |
| 10 | App | Add `mqtt.js` dependency and useMQTT hook |
| 11 | App | Refactor useESP8266Context for MQTT |
| 12 | App | Create provisioning screen |
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

**Step 1: Replace ESP8266Client dependency with MQTT**

Change the scheduler to import `mqttHandler` and call `mqttHandler.publishDevice(chipId, 'command', {...})` instead of `this.espClient.sendCommand(...)`.

Key changes:
- Replace `ESP8266Client` import with `mqttHandler` import
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
git commit -m "refactor: feed scheduler uses MQTT instead of ESP8266Client"
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

### Task 5: Server — Remove WebSocket proxy and ESP8266Client

**Files:**
- Delete: `server/src/services/esp8266Client.ts`
- Delete: `server/src/websocket/proxyHandlers.ts`
- Modify: `server/src/server.ts` (remove WebSocket setup and proxy references)

**Step 1: Remove WebSocket imports and proxy references from server.ts**

Remove:
- `import { createServer } from "http";`
- `import WebSocket, { WebSocketServer } from "ws";`
- `import { ESP8266Client } from "./services/esp8266Client";`
- `import { WebSocketProxyHandler } from "./websocket/proxyHandlers";`
- The `wss` field and all its usages
- The `esp8266Client` and `wsProxyHandler` fields
- The `setupWebSocket()` private method
- ESP8266-specific REST endpoints (`/api/esp8266/*`, `/api/command`, `/api/clients`)
- Update `/health` and `/stats` to remove ESP8266/proxy references
- Update the `start()` method to not call `this.esp8266Client.connect()` or `this.setupWebSocket()`
- Update `stop()` to not call `this.wsProxyHandler.shutdown()` or close `wss`

Keep:
- Express app, REST API routes (schedules, history, alerts), Prisma
- FeedScheduler (now refactored)
- CORS, JSON parsing

**Step 2: Delete removed files**

```bash
rm server/src/services/esp8266Client.ts
rm -r server/src/websocket/
```

**Step 3: Remove `ws` and `uuid` dependencies (if no longer needed)**

Run: `npm uninstall ws uuid` and `npm uninstall @types/ws @types/uuid`

**Step 4: Commit**

```bash
git add -A server/
git commit -m "refactor: remove WebSocket proxy and ESP8266Client; server is API+cron only"
```

---

### Task 6: Server — Clean up types and config

**Files:**
- Modify: `server/src/types/index.ts`

**Step 1: Remove proxy-specific types and configs**

Remove:
- `ClientInfo` (no longer tracking app clients on server)
- `ESP8266Config` and `DEFAULT_ESP8266_CONFIG` (no more ESP8266 connection config)
- Update `ServerConfig` to remove `esp8266Config` field
- Update `DEFAULT_SERVER_CONFIG` to remove `esp8266Config`

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

### Task 7: Firmware — Add ESP8266 MQTT client

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino`

**Step 1: Replace WebSocket with MQTT library**

Replace:
```cpp
#include <WebSocketsServer.h>
```
with:
```cpp
#include <PubSubClient.h>
```

**Step 2: Add MQTT client and WiFi client globals**

Replace:
```cpp
WebSocketsServer webSocket = WebSocketsServer(81);
```
with:
```cpp
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
```

**Step 3: Add MQTT config and device identity**

```cpp
const char* mqttBroker = ""; // set during provisioning
const int mqttPort = 1883;
String deviceChipId = String(ESP.getChipId(), HEX);
String mqttPassword = ""; // generated during provisioning
String mqttClientId = "floyd-" + deviceChipId;

// MQTT topics
String topicCommand;
String topicTelemetry;
String topicStatus;
String topicResponse;

void setupMQTTTopics() {
  topicCommand = "floyd/devices/" + deviceChipId + "/command";
  topicTelemetry = "floyd/devices/" + deviceChipId + "/telemetry";
  topicStatus = "floyd/devices/" + deviceChipId + "/status";
  topicResponse = "floyd/devices/" + deviceChipId + "/response";
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  if (String(topic) == topicCommand) {
    String message = String(msg);
    handleMQTTMessage(message);
  }
}

void connectMQTT() {
  if (mqttClient.connected()) return;

  Serial.print("Connecting to MQTT broker... ");
  if (mqttClient.connect(mqttClientId.c_str(), "", mqttPassword.c_str())) {
    Serial.println("connected!");
    mqttClient.subscribe(topicCommand.c_str());

    // Publish online status
    StaticJsonDocument<128> statusDoc;
    statusDoc["type"] = "status";
    statusDoc["data"]["connected"] = true;
    String output;
    serializeJson(statusDoc, output);
    mqttClient.publish(topicStatus.c_str(), output.c_str(), true); // retain
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}
```

**Step 4: Commit (to firmware sources)**

```bash
git add ESP8266_WebSocket_Server.ino
```

---

### Task 8: Firmware — Add SoftAP provisioning mode

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino`

**Step 1: Add provisioning mode logic**

On boot, try saved WiFi. If fails, start AP mode with captive portal:

```cpp
#include <ESP8266WebServer.h>
#include <DNSServer.h>

ESP8266WebServer server(80);
DNSServer dnsServer;

bool provisioningMode = false;

void startProvisioningMode() {
  provisioningMode = true;

  WiFi.mode(WIFI_AP);
  IPAddress apIP(192, 168, 4, 1);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(("FloydFeeder-" + deviceChipId).c_str());

  dnsServer.start(53, "*", apIP);

  // Serve provisioning page
  server.on("/", HTTP_GET, []() {
    String html = R"rawliteral(
<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Floyd Feeder Setup</title>
<style>body{font-family:Arial;padding:20px;max-width:400px;margin:auto}
input{width:100%;padding:10px;margin:8px 0;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
button{width:100%;padding:12px;background:#2e7d32;color:white;border:none;border-radius:4px;font-size:16px}
.device-id{font-size:12px;color:#888;margin-bottom:16px}</style></head>
<body><h2>Floyd Feeder Setup</h2>
<div class='device-id'>Device ID: DEVICE_ID_PLACEHOLDER</div>
<form action='/connect' method='POST'>
<label>WiFi SSID</label><input type='text' name='ssid' required>
<label>WiFi Password</label><input type='password' name='password' required>
<label>Device Name</label><input type='text' name='name' placeholder='My Fish Feeder'>
<button type='submit'>Connect</button></form>
</body></html>
)rawliteral";
    html.replace("DEVICE_ID_PLACEHOLDER", deviceChipId);
    server.send(200, "text/html", html);
  });

  server.on("/connect", HTTP_POST, []() {
    String ssid = server.arg("ssid");
    String password = server.arg("password");
    String name = server.arg("name");

    // Generate random MQTT password
    mqttPassword = String(random(0x10000000, 0x7FFFFFFF), HEX);
    mqttBroker = "broker.hivemq.com";

    // Save to EEPROM
    saveWiFiCredentials(ssid.c_str(), password.c_str());

    server.send(200, "text/html", "<h2>Connected!</h2><p>Device will restart in 3 seconds...</p><script>setTimeout(function(){window.close()},3000)</script>");
    delay(3000);
    ESP.restart();
  });

  server.begin();
  Serial.println("Provisioning portal started at 192.168.4.1");
}

void saveWiFiCredentials(const char* ssid, const char* password) {
  // Store in EEPROM — extend existing EEPROMConfig or add separate storage
  // TODO: implement alongside existing config EEPROM
}

void loadWiFiCredentials() {
  // TODO: read from EEPROM, set global ssid/password
}
```

**Step 2: Update setup() to support dual-mode boot**

```cpp
void setup() {
  // ... existing sensor/motor init ...

  setupMQTTTopics();

  loadConfig();
  totalVolumeCm3 = computeTotalVolume();

  // Try saved WiFi
  if (loadWiFiCredentials() && ssid[0] != '\0') {
    connectToWiFi();
  }

  if (WiFi.status() == WL_CONNECTED) {
    mqttClient.setServer(mqttBroker, mqttPort);
    mqttClient.setCallback(mqttCallback);
    connectMQTT();
  } else {
    startProvisioningMode();
  }
}
```

**Step 3: Commit**

---

### Task 9: Firmware — Wire MQTT into command handler and sensor broadcast

**Files:**
- Modify: `ESP8266_WebSocket_Server.ino`

**Step 1: Rename/refactor handleWebSocketMessage → handleMQTTMessage**

The message handler stays identical — it already parses JSON and dispatches by `action`. Only the source changes.

Remove `num` parameter (MQTT doesn't have per-client IDs). Change all `webSocket.broadcastTXT(output)` and `webSocket.sendTXT(num, output)` to `mqttClient.publish(topicResponse.c_str(), output)`.

**Step 2: Update sensor broadcast**

Change `broadcastSensorData()`:
- Replace `webSocket.broadcastTXT(output)` → `mqttClient.publish(topicTelemetry.c_str(), output)`

**Step 3: Update loop()**

```cpp
void loop() {
  ESP.wdtFeed();

  if (provisioningMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  // MQTT loop
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      connectMQTT();
    }
    mqttClient.loop();
  }

  checkWiFiConnection();
  updateMotorState();

  unsigned long now = millis();
  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;
    readSensors();
    broadcastSensorData();
  }

  delay(5);
}
```

**Step 4: Commit**

```bash
git add ESP8266_WebSocket_Server.ino
git commit -m "feat: replace WebSocket server with MQTT client in ESP8266 firmware"
```

---

### Task 10: App — Add `mqtt.js` dependency and useMQTT hook

**Files:**
- Create: `hooks/useMQTT.ts`
- Modify: `package.json`

**Step 1: Install mqtt.js**

Run: `npm install mqtt` in project root.

**Step 2: Write useMQTT hook**

Creates an MQTT client that:
- Connects to HiveMQ via MQTTS on app side
- Handles reconnect, message parsing (same JSON format)
- Exposes `publish()`, `subscribe()`, connection state, lastMessage

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import mqtt, { MqttClient } from 'mqtt';

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

  const connect = useCallback(() => {
    if (!deviceChipId) return;
    if (clientRef.current) {
      clientRef.current.end();
    }

    const client = mqtt.connect(BROKER_URL, {
      clientId: `floyd-app-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 15000,
    });

    client.on('connect', () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
      client.subscribe(`floyd/devices/${deviceChipId}/telemetry`);
      client.subscribe(`floyd/devices/${deviceChipId}/status`);
      client.subscribe(`floyd/devices/${deviceChipId}/response`);
    });

    client.on('message', (_topic, message) => {
      try {
        const parsed: MQTTMessage = JSON.parse(message.toString());
        setState(prev => ({ ...prev, lastMessage: parsed, error: null }));
      } catch (e) {
        console.error('Failed to parse MQTT message:', e);
      }
    });

    client.on('error', (err) => {
      setState(prev => ({ ...prev, error: err.message }));
    });

    client.on('close', () => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    clientRef.current = client;
  }, [deviceChipId]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end();
      clientRef.current = null;
    }
    setState({ isConnected: false, error: null, lastMessage: null });
  }, []);

  const publish = useCallback((topic: string, payload: object) => {
    if (!clientRef.current || !clientRef.current.connected) return false;
    const fullTopic = `floyd/devices/${deviceChipId}/${topic}`;
    clientRef.current.publish(fullTopic, JSON.stringify(payload));
    return true;
  }, [deviceChipId]);

  useEffect(() => {
    if (deviceChipId) { connect(); }
    return () => { disconnect(); };
  }, [deviceChipId]);

  return { ...state, connect, disconnect, publish };
};

export default useMQTT;
```

**Step 3: Commit**

```bash
git add hooks/useMQTT.ts package.json package-lock.json
git commit -m "feat: add mqtt.js dependency and useMQTT hook"
```

---

### Task 11: App — Refactor useESP8266Context for MQTT

**Files:**
- Modify: `hooks/useESP8266Context.tsx`

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
git add hooks/useESP8266Context.tsx
git commit -m "refactor: useESP8266Context uses MQTT instead of WebSocket"
```

---

### Task 12: App — Create provisioning screen

**Files:**
- Create: `app/provision.tsx`

**Step 1: Write the provisioning screen**

A screen with:
- WiFi network scanner (uses `react-native-wifi-reborn` or `@react-native-community/netinfo`)
- Shows discovered FloydFeeder-XXXX APs
- On tap: connects phone to ESP AP, opens WebView at 192.168.4.1
- After provisioning: reads the device ID + MQTT password, calls claim API
- Saves chipId to AsyncStorage for future use

```typescript
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLOUD_SERVER = 'https://floyd-feeder.up.railway.app';

export default function ProvisionScreen() {
  const [step, setStep] = useState<'scan' | 'provisioning' | 'done'>('scan');
  const [deviceFound, setDeviceFound] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');

  const claimDevice = async (chipId: string, name: string, mqttPassword: string) => {
    const res = await fetch(`${CLOUD_SERVER}/api/devices/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: chipId, deviceName: name, mqttPassword }),
    });
    const data = await res.json();
    if (data.success) {
      await AsyncStorage.setItem('floydChipId', chipId);
      setDeviceId(chipId);
      setStep('done');
    }
  };

  return (
    <View style={styles.container}>
      {step === 'scan' && (
        <WebView
          source={{ uri: 'http://192.168.4.1' }}
          onNavigationStateChange={(navState) => {
            // Extract device ID from the provisioning page
            // After form submit, ESP redirects with mqttPassword in URL
            if (navState.url.includes('chipId=')) {
              const params = new URLSearchParams(navState.url.split('?')[1]);
              const chipId = params.get('chipId') || '';
              const password = params.get('password') || '';
              const name = params.get('name') || 'Floyd Feeder';
              setDeviceId(chipId);
              claimDevice(chipId, name, password);
            }
          }}
          style={{ flex: 1 }}
        />
      )}
      {step === 'done' && (
        <View style={styles.centered}>
          <Text style={styles.title}>Device Connected!</Text>
          <Text>Device ID: {deviceId}</Text>
          <Text>Your Floyd Feeder is now online.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
});
```

**Step 2: Add react-native-webview dependency**

Run: `npm install react-native-webview`

**Step 3: Commit**

```bash
git add app/provision.tsx package.json package-lock.json
git commit -m "feat: add provisioning screen with in-app WebView"
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
- Modify: `components/ESP8266Connection.tsx` (update status display)

**Step 1: Update _layout.tsx to handle chipId from AsyncStorage**

```typescript
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useESP8266 } from '@/hooks/useESP8266Context';

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

**Step 2: Update ESP8266Connection component**

Remove the "Connect to Cloud Server" button (auto-connects now). Show MQTT connection status and chipId.

**Step 3: End-to-end smoke test**

1. Flash ESP8266 with new firmware
2. ESP boots into AP mode (no saved WiFi)
3. Phone connects to FloydFeeder-XXXX
4. App provisioning screen opens provisioning portal
5. User enters WiFi credentials → ESP reboots
6. ESP connects to home WiFi → connects to HiveMQ
7. App claims device via REST API
8. App connects to HiveMQ → receives telemetry
9. App sends start_feed command → ESP executes
10. Cron scheduler fires at scheduled time → ESP feeds

**Step 4: Commit**

```bash
git add app/_layout.tsx components/ESP8266Connection.tsx
git commit -m "feat: wire end-to-end MQTT integration with provisioning flow"
```

---

## Environment Variables Summary

### Server (.env on Railway)

```
PORT=3001
DATABASE_URL=file:./prisma/floyd.db
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
```

### Removed from server

```
ESP8266_HOST          (no longer needed)
ESP8266_PORT          (no longer needed)
USE_MQTT              (no longer toggle — always MQTT)
MQTT_USERNAME         (HiveMQ free tier doesn't require)
MQTT_PASSWORD
MQTT_CLIENT_ID
MQTT_TOPIC_PREFIX
```

---

*Plan generated from design doc `docs/plans/2026-04-29-cloud-mqtt-architecture-design.md`*
