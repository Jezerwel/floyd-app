# Floyd Feeder Cloud MQTT Architecture

**Date:** 2026-04-29
**Status:** Design approved — pending implementation plan

## 1. Motivation

Current architecture has a fundamental topology problem: the cloud server on Railway initiates a WebSocket connection *to* the ESP32 (`ws://<ESP_IP>:81`). The ESP32 sits behind a home NAT — the cloud cannot reach it unless it has a public IP or port forwarding.

Additionally, WiFi credentials are hardcoded, and there is no device discovery, pairing, or provisioning flow.

**Goal:** Make the fish feeder work like any smart home device — provision over WiFi, connect to cloud, operate from anywhere regardless of network.

## 2. High-Level Architecture

```
                    ┌─────────────────────┐
                    │     HiveMQ Cloud     │
                    │   (MQTT Broker)      │
                    │  broker.hivemq.com   │
                    └──┬──────────────┬───┘
                       │              │
                 MQTT (plain)    MQTTS (TLS)
                       │              │
              ┌────────┴───┐    ┌─────┴──────────┐
              │ ESP32     │    │  Mobile App     │
              │ (MQTT cli)  │    │  (mqtt.js)      │
              │ publishes:  │    │  subscribes:    │
              │  telemetry  │    │  telemetry      │
              │  status     │    │  status         │
              │ subscribes: │    │ publishes:      │
              │  command    │    │  command        │
              └─────────────┘    └─────────────────┘
                                       │
                                  REST API (HTTP)
                                       │
                              ┌────────┴─────────┐
                              │  Railway Server   │
                              │  (Express)         │
                              │  - REST API        │
                              │  - Prisma/SQLite   │
                              │  - Cron scheduler  │
                              │  - MQTT client     │
                              └────────────────────┘
```

**Key change:** The proxy layer is removed. App and ESP both connect to the MQTT broker directly. The server handles persistence and cron-triggered feeds only.

## 3. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Protocol | MQTT | Industry standard for IoT; QoS, retain, last-will; HiveMQ free tier handles everything |
| Broker | HiveMQ Cloud Serverless free tier | 100 connections/10GB free, no credit card, MQTT 5.0 + WebSocket + TLS support |
| ESP MQTT library | EspMQTTClient (wraps PubSubClient) | Raw PubSubClient has documented reliability issues on ESP32 — keepalive timeout bugs, failed reconnects (GitHub issues #243, #795, #825). EspMQTTClient handles reconnection & WiFi monitoring. |
| ESP→Broker TLS | No TLS | ESP32 heap constraints (~320KB free heap (ESP32)); home WiFi hop is trusted |
| App→Broker | MQTTS (TLS) over port 8883 | mqtt.js v5.9+ with `timerVariant: 'native'` for Hermes engine compatibility |
| WiFi provisioning | WiFiManager with custom MQTT params | Handles captive portal, SSID selector, auto-reconnect. Custom params for MQTT broker/password. |
| Device pairing | Anonymous claim | No auth for now; device ID (chip MAC) + generated MQTT password stored in EEPROM |
| Platform | Android-first | iOS NEHotspotConfiguration limitations unacceptable for this flow |

## 4. MQTT Topic Structure

```
floyd/
  devices/
    {chipId}/
      telemetry      ← ESP publishes sensor_data JSON
      status         ← ESP publishes connection status, uptime, heap, WiFi RSSI
      command        ← App & server publish: start_feed, stop_feed, clear_jam, etc.
      response       ← ESP publishes acks: feed_complete, jam_clear_complete
      config         ← App publishes: set_sensor_interval, set_config
```

Message format remains identical to current WebSocket JSON protocol — no changes to the payload structure.

## 5. Provisioning Flow (In-App SoftAP)

```
1. ESP boots → no saved WiFi → starts as AP "FloydFeeder-XXXX"
   Captive portal page served at 192.168.4.1 via on-board web server

2. App detects ESP AP via Android WifiManager APIs
   Shows "Discovered FloydFeeder-XXXX" in app UI
   User taps to begin setup

3. App uses Android WiFi API to connect to FloydFeeder-XXXX
   (no user leaves the app)

4. App opens WebView at 192.168.4.1 → ESP serves provisioning page:
   - Device ID (chip MAC, auto-populated)
   - Input: home WiFi SSID + password
   - Input: device name (optional)
   - Display: generated MQTT password for this device

5. User enters home WiFi credentials → form POSTs to ESP

6. ESP:
   - Saves WiFi + MQTT password to EEPROM
   - Shows "Success! Device will restart..."
   - Reboots after 3s

7. ESP boots → connects to home WiFi → connects to HiveMQ
   as client ID: floyd-<chipId>, password: <generated>

8. App POSTs to server: POST /api/devices/claim
   { deviceId, deviceName, mqttPassword }

9. Server records device in new Device table

10. App disconnects from ESP's AP, reconnects to home WiFi,
    then connects to HiveMQ via MQTTS
```

## 6. Component Changes

### 6.1 ESP32 Firmware (`ESP32_MQTT_Server.ino`)

| Change | Detail |
|---|---|
| Remove | `WebSocketsServer` — entire `webSocket.loop()`, `broadcastTXT()`, port 81 listener |
| Remove | `webSocketEvent()` handler and all WebSocket-specific code |
| Add | `EspMQTTClient` library (wraps PubSubClient with reconnection logic) |
| Add | `WiFiManager` library with custom WiFiManagerParameter for device ID display |
| Add | MQTT password generation + extended EEPROM storage (WiFi SSID, password, broker, MQTT password) |
| Change | `connectToWiFi()` → try EEPROM WiFi first; fallback to `WiFiManager.autoConnect()` |
| Change | Command handling: subscribe to `floyd/devices/{chipId}/command`; **use flag pattern — never publish from callback** |
| Change | Sensor broadcast: publish to `floyd/devices/{chipId}/telemetry` via `mqttClient.publish()` |
| Change | `loop()`: remove WebSocket loop; EspMQTTClient handles internal loop; add `delay(10)` for WiFi stability |
| Critical | Add `yield()` and watchdog feeds; ensure `delay()` between MQTT loop iterations |
| Keep | All motor control, sensor reading, volume calculation, existing EEPROM geometry config |

### 6.2 Mobile App (React Native)

| Change | Detail |
|---|---|
| Add | `mqtt.js` npm dependency |
| Remove | `hooks/useWebSocket.ts` — replaced by MQTT-based hook |
| Refactor | `hooks/useESP32Context.tsx` — `sendCommand` → `publish`; `lastMessage` → MQTT subscription |
| Add | `screens/provision.tsx` — WiFi scan, WebView, claim API call |
| Add | `hooks/useMQTT.ts` — MQTT equivalent of useWebSocket with reconnect, topic subscriptions |
| Keep | All UI screens (dashboard, controls, schedule, history) |
| Keep | `services/api.ts` — REST API calls unchanged (schedule CRUD, history) |

### 6.3 Server (Express + Prisma)

| Change | Detail |
|---|---|
| Remove | `services/esp32Client.ts` — server no longer connects to ESP |
| Remove | `websocket/proxyHandlers.ts` — no WebSocket proxy for app |
| Remove | `WebSocketServer` from `server.ts` |
| Add | `mqtt` npm dependency |
| Add | `services/mqttClient.ts` — subscribes to telemetry for logging; publishes cron commands |
| Add | Prisma model `Device` (id, chipId, name, mqttPassword, claimedAt) |
| Add | `POST /api/devices/claim` endpoint |
| Refactor | `services/scheduler.ts` — publish to MQTT topic instead of `espClient.sendCommand()` |
| Keep | All REST API routes, Prisma schema (FeedSchedule, FeedLog, AlertConfig), cron scheduler |

## 7. New Prisma Model

```prisma
model Device {
  id           String   @id @default(uuid())
  chipId       String   @unique
  name         String
  mqttPassword String
  claimedAt    DateTime @default(now())
}
```

## 8. Environment Variables (Server)

| Variable | Purpose |
|---|---|
| `PORT` | Express server port (default: 3001) |
| `DATABASE_URL` | Prisma SQLite path |
| `MQTT_BROKER_URL` | HiveMQ cluster URL (mqtt://...) |
| `MQTT_USERNAME` | (optional) HiveMQ credentials |
| `MQTT_PASSWORD` | (optional) HiveMQ credentials |

ESP32-specific env vars (`ESP32_HOST`, `ESP32_PORT`) are removed.

## 9. No-Auth Security Model

- Device identity: ESP32 chip MAC address
- MQTT password: random string generated during provisioning, stored in EEPROM + server DB
- Claim: any client that presents the correct deviceId + mqttPassword owns the device
- No user accounts, no JWT, no session management
- **Migration note:** if user accounts are added later, the device claim can be retrofitted under an authenticated user

## 10. Trade-offs & Risks

| Risk | Mitigation |
|---|---|
| PubSubClient on ESP32 unreliable | Use EspMQTTClient wrapper instead; add yield() + delay in loop; never publish from callback |
| mqtt.js "Keepalive timeout" on React Native Hermes | Set `timerVariant: 'native'`, `reschedulePings: true`, `keepalive: 30` |
| process.nextTick not available in RN | Polyfill with `setTimeout(callback, 0)` before importing mqtt |
| No TLS on ESP→broker means MQTT password visible on LAN | Acceptable for home use; password is per-device and random |
| HiveMQ free tier no SLA (can go down) | Acceptable for personal project; no critical uptime requirement |
| Cron scheduler publishes via MQTT — if MQTT broker is down, feeds are missed | Add dead-letter-style FeedLog entries on publish failure |
| WiFiManager custom param EEPROM save/load not built-in | Manual implementation needed; extend existing EEPROMConfig struct |
| MQTT password must reach the phone during provisioning | WiFiManager custom parameter displayed on success page; WebView injectedJS captures it |

## 11. Next Steps

1. Write implementation plan (via writing-plans skill)
2. Implement in order: firmware → server → mobile app
3. Test full provisioning flow end-to-end

---

*Design approved by user on 2026-04-29.*
