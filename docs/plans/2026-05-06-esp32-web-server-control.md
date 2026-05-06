# ESP32 Web Server — Browser-Based Control Plan

**Date:** 2026-05-06
**Status:** Plan
**Goal:** Add a third transport mode to the Floyd ESP32 firmware — an HTTP web server that serves a control dashboard accessible from any smartphone browser, no app required.

---

## 1. Motivation & Context

The ESP32 currently has two transport modes:
| Mode | Range | Requires | Pros |
|------|-------|----------|------|
| **BLE** | ~10m | Floyd app | Low power, fast pairing |
| **SoftAP+MQTT** | ~20m | Floyd app + WiFi | Works without internet |

A **web server mode** adds a third option:

- **No app** — open `http://192.168.4.1` in any browser
- **Cross-platform** — iOS, Android, desktop, any OS
- **Zero install** — perfect for quick testing, guests, or as a fallback
- **Can coexist** — WebSockets + REST alongside BLE/MQTT

**Vehicle analogy:** Same pattern used for ESP32 robot cars, drone ground stations, and RC vehicle controllers — serve a dashboard with joysticks/sliders over HTTP.

---

## 2. Approach Comparison

### Option A: ESPAsyncWebServer + WebSockets (⭐ RECOMMENDED)

| Aspect               | Detail                                      |
| -------------------- | ------------------------------------------- |
| **Library**          | `ESPAsyncWebServer` + `AsyncWebSocket`      |
| **Architecture**     | Async, non-blocking, event-driven           |
| **Real-time**        | ✅ WebSockets for bidirectional low-latency |
| **Multiple clients** | ✅ Native support                           |
| **HTML storage**     | PROGMEM strings (no filesystem needed)      |
| **Ecosystem**        | Most popular, well-maintained               |

**Trade-off:** Slightly more code to embed HTML; but for a control dashboard it's manageable.

### Option B: Built-in `WebServer` + AJAX polling

| Aspect               | Detail                                            |
| -------------------- | ------------------------------------------------- |
| **Library**          | Built-in `WiFiServer` + `WebServer`               |
| **Architecture**     | Synchronous, blocking per request                 |
| **Real-time**        | ❌ Polling only (e.g. `setInterval(fetch, 1000)`) |
| **Multiple clients** | Blocking — one slow request delays others         |
| **HTML storage**     | PROGMEM strings                                   |

**Trade-off:** Simpler but no real-time feel. Fine for toggles, bad for motor status/sensor updates.

### Option C: LittleFS + SPA (Single Page App)

| Aspect           | Detail                                      |
| ---------------- | ------------------------------------------- |
| **Library**      | `ESPAsyncWebServer` + `LittleFS`            |
| **HTML storage** | Flash filesystem — upload HTML as files     |
| **Complexity**   | Higher — separate build step for filesystem |
| **Pros**         | Works for complex UIs with many assets      |

**Trade-off:** Overkill for a control dashboard. Use only if you need icons/images/fonts.

---

## 3. Recommended Architecture

```
┌─────────────────────────────────────────┐
│              ESP32                      │
│                                          │
│  ┌────────────────┐  ┌──────────────┐   │
│  │ Web Server      │  │ Motor Control │   │
│  │ (AsyncWebServer)│◄─┤ + Sensors     │   │
│  │  Port 80 HTTP   │  │              │   │
│  │  Port 81 WS     │  └──────────────┘   │
│  └───────┬────────┘       ▲              │
│          │                │              │
│  ┌───────┴────────┐       │              │
│  │ WebSocket      ├───────┘              │
│  │ (state sync)   │                      │
│  └────────────────┘                      │
│          │                               │
│          │ WiFi (AP or STA)              │
└──────────┼──────────────────────────────┘
           │
      ┌────┴────┐
      │ Phone   │
      │ Browser │
      │ http:// │
      │ 192.168.│
      │ 4.1     │
      └─────────┘
```

### Data Flow

1. **Page load:** Browser GET `/` → ESP32 serves HTML+CSS+JS (embedded in PROGMEM)
2. **WebSocket connect:** JS opens `ws://192.168.4.1:81/ws`
3. **State sync on connect:** ESP32 pushes full device status JSON over WS
4. **User actions:** JS sends `{ action: "start_feed", ... }` over WS
5. **Telemetry push:** ESP32 pushes sensor data + motor state over WS periodically
6. **Command responses:** ESP32 sends `{ type: "control_response", data: {...} }` over WS

### JSON Protocol (reuses existing Floyd format)

Same actions as current MQTT/BLE — the web UI just sends them over WebSocket:

```json
// Client → ESP32 (commands)
{ "action": "start_feed", "parameters": { "augerSpeed": 768, "feedMs": 3000 } }
{ "action": "stop_feed" }
{ "action": "clear_jam", "parameters": { "speed": 512, "duration": 2000 } }
{ "action": "get_sensors" }
{ "action": "set_schedules", "parameters": { "schedules": [...] } }

// ESP32 → Client (state/telemetry)
{ "type": "sensor_data", "data": { "foodLevelPercentage": 72.5, "motorState": "idle" } }
{ "type": "control_response", "data": { "action": "feed_complete", "success": true } }
{ "type": "status", "data": { "uptime": 3600000, "freeHeap": 123456 } }
```

---

## 4. WiFi Mode Strategy

The web server mode works in **two WiFi sub-modes**:

### Mode 1: SoftAP (Direct Connection)

- ESP32 becomes `FloydFeeder-{chipId}` WiFi AP
- Phone connects to ESP32's WiFi
- Browser opens `http://192.168.4.1`
- **No external network needed**

### Mode 2: Station Mode (Home WiFi)

- ESP32 connects to your home WiFi (credentials saved in NVS)
- Phone on same network
- Browser opens `http://floyd-feeder-{chipId}.local` (mDNS) or static IP
- **Internet not required, just local network**

### Mode Switching

- Default to **SoftAP** on first boot
- Optional: WiFiManager portal to configure home WiFi
- Web UI shows a "Connect to WiFi" form to enter SSID/password
- Falls back to BLE/AP+MQTT when web mode times out (same 60s idle timeout pattern)

---

## 5. Implementation Plan

### Phase 1: Extract Shared HTML Template

**File:** `ESP32_WebServer.h` (new header)

Define the HTML page as a raw string literal (PROGMEM). Structure:

```
ESP32_WebServer.h
├── INDEX_HTML[]         → Full dashboard HTML
│   ├── <head>           → CSS (embedded <style>)
│   │   ├── Variables    → Dark/light theme
│   │   ├── Layout       → Flexbox grid
│   │   ├── Controls     → Slider, button, card styles
│   │   └── Mobile-first → Touch targets ≥44px
│   └── <body>           → Semantic HTML
│       ├── Header       → Device name + connection status
│       ├── Status cards → Food level, motor state, uptime
│       ├── Controls     → FEED button, STOP, CLEAR JAM
│       ├── Sliders      → Auger speed, impeller speed, duration
│       └── Schedule     → Schedule list (read-only for v1)
├── APP_JS[]            → Inline JavaScript (embedded <script>)
│   ├── WS.connect()    → WebSocket lifecycle
│   ├── WS.onmessage()  → State update handler
│   ├── sendCommand()   → Action dispatcher
│   ├── renderState()   → DOM updates
│   └── setupSliders()  → Touch slider input handling
└── styles[]            → Optional: separate CSS (kept in <style> for single-file)
```

### Phase 2: Integrate with Main Sketch

**File:** `ESP32_MQTT_Server.ino`

Add a new mode flag and initialization:

```cpp
// New defines
#define WEB_SERVER_PORT 80
#define WEB_SOCKET_PORT 81

// Library includes
#include <ESPAsyncWebServer.h>

// Globals
bool webModeEnabled = false;  // set from provisioning/NVS
AsyncWebServer webServer(WEB_SERVER_PORT);
AsyncWebSocket ws("/ws");     // WebSocket endpoint

// In setup():
if (webModeEnabled) {
    initWebServer();
}
```

The web server mode should be a **third runtime mode** alongside BLE and SoftAP+MQTT, selected via NVS preference or the existing `switch_mode` action.

### Phase 3: WebSocket Handler Callbacks

```cpp
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len) {

  switch (type) {
    case WS_EVT_CONNECT:
      // Push full device status on connect
      sendFullStatus(client);
      break;

    case WS_EVT_DISCONNECT:
      break;

    case WS_EVT_DATA: {
      // Parse JSON command and dispatch to handleMQTTMessage()
      AwsFrameInfo *info = (AwsFrameInfo*)arg;
      if (info->final && info->index == 0 && info->len == len) {
        String msg = String((char*)data).substring(0, len);
        handleMQTTMessage(msg);  // Reuse existing command handler!
      }
      break;
    }

    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      break;
  }
}
```

**Key insight:** WebSocket commands reuse `handleMQTTMessage()` — no new command parsing needed. The response path needs a new `broadcastResponse()` variant that pushes to WebSocket clients instead of (or in addition to) BLE/MQTT.

### Phase 4: Response Routing

Extend the existing `broadcastResponse()` / `flushPendingResponseTransport()` to also push to all connected WebSocket clients:

```cpp
void broadcastResponse(JsonDocument &doc) {
  // Keep existing BLE/MQTT paths...
  String output;
  serializeJson(doc, output);
  pendingResponse = output;

  // NEW: Push to all WebSocket clients
  ws.textAll(output);
}
```

**Alternative:** Make WebSocket the transport-agnostic "bus" and have BLE/MQTT subscribe to it. But the simplest approach is to just add `ws.textAll()` calls.

### Phase 5: Serve Static Files

```cpp
void initWebServer() {
  // Serve the dashboard HTML at root
  webServer.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    AsyncWebServerResponse *response = request->beginResponse_P(
      200, "text/html", INDEX_HTML);
    response->addHeader("Cache-Control", "no-cache");
    request->send(response);
  });

  // Health/status endpoint (JSON)
  webServer.on("/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<384> doc;
    buildDeviceStatusJson(doc);
    String json;
    serializeJson(doc, json);
    request->send(200, "application/json", json);
  });

  // WebSocket handler
  ws.onEvent(onWsEvent);
  webServer.addHandler(&ws);

  // Start server
  webServer.begin();
}
```

### Phase 6: Periodic Telemetry

As with BLE/MQTT, `broadcastSensorData()` already pushes sensor data. Add the WebSocket broadcast there too:

```cpp
void broadcastSensorData() {
  // ... existing serialize ...

  // Push to WebSocket clients
  ws.textAll(output);
}
```

---

## 6. HTML Dashboard Design (Mobile-First)

The UI should mirror the React Native app's controls screen for familiarity:

```
┌──────────────────────┐
│  ⚙ Floyd Feeder     │  ← header + connection dot
│  ● Connected         │
├──────────────────────┤
│  ┌──────────────────┐│
│  │ Food:   ██████░░ ││  ← status cards
│  │ Motor: idle      ││
│  │ Uptime: 2h 15m   ││
│  └──────────────────┘│
│                      │
│  Auger Speed ─────── │  ← sliders
│  Spread     ────────│
│  Duration   ────────│
│                      │
│  ┌──────────────────┐│
│  │      ⏹ STOP     ││  ← action buttons
│  │      ▶ FEED     ││
│  │  ↺ CLEAR JAM    ││
│  └──────────────────┘│
│                      │
│  [Schedule]          │  ← collapsible section
│  ▸ 08:00 daily       │
│  ▸ 18:00 Mon-Fri     │
├──────────────────────┤
│ 📱 floyd-app also    │  ← install pitch
│    available         │
└──────────────────────┘
```

**Key UI decisions:**

| Decision                  | Rationale                             |
| ------------------------- | ------------------------------------- |
| Single HTML file          | No multi-file serving complexity      |
| Embedded CSS/JS           | Zero external dependencies            |
| Mobile-first CSS          | Controls are for phone browsers       |
| No frameworks (React/Vue) | Vanilla JS keeps payload tiny (~15KB) |
| WebSocket auto-reconnect  | Handle temporary disconnects          |
| Touch event handling      | Sliders need touch, not just mouse    |

### CSS Design Tokens (match the React Native app)

```css
:root {
  --primary: #4caf50;
  --secondary: #2196f3;
  --error: #f44336;
  --warning: #ff9800;
  --bg: #f5f5f5;
  --card: #ffffff;
  --text: #212121;
  --text-secondary: #757575;
  --border: #e0e0e0;
  --radius: 12px;
}
```

---

## 7. File Changes Summary

| File                                | Action     | Purpose                                                    |
| ----------------------------------- | ---------- | ---------------------------------------------------------- |
| `ESP32_WebServer.h`                 | **NEW**    | HTML/CSS/JS dashboard template in PROGMEM                  |
| `ESP32_MQTT_Server.ino`             | **MODIFY** | Add `ESPAsyncWebServer` includes, init, WebSocket handlers |
| `platformio.ini` or `boards.txt`    | **MODIFY** | Add `ESPAsyncWebServer` dependency                         |
| `ESP32_Setup_Guide.md`              | **UPDATE** | Document web server mode access                            |
| `docs/floyd-feeder-manual-setup.md` | **UPDATE** | Add web UI section                                         |

---

## 8. Dependencies

### Arduino Libraries

| Library             | Version             | Size  | Purpose                           |
| ------------------- | ------------------- | ----- | --------------------------------- |
| `ESPAsyncWebServer` | ≥3.7.1              | ~50KB | Async HTTP server                 |
| `AsyncTCP`          | ≥3.3.1              | ~15KB | TCP backend for ESPAsyncWebServer |
| `ArduinoJson`       | (already installed) | —     | JSON serialization (reused)       |

**Install via Library Manager:**

```cpp
// platformio.ini
lib_deps =
    ESPAsyncWebServer @ ^3.7.1
    AsyncTCP @ ^3.3.1

// Or Arduino IDE: Tools → Manage Libraries → search "ESP Async Web Server"
```

### Flash Impact

| Component                | Size                 |
| ------------------------ | -------------------- |
| HTML dashboard (gzipped) | ~8-12KB              |
| ESPAsyncWebServer lib    | ~50KB                |
| AsyncTCP                 | ~15KB                |
| **Total**                | **~75KB additional** |

Acceptable for ESP32 (4MB flash typical). If tight, set partition scheme to "Huge APP".

---

## 9. Testing Plan

1. **SoftAP web mode:** Flash ESP32, connect phone to `FloydFeeder-XXXX` WiFi, open `http://192.168.4.1`, verify dashboard loads
2. **Static files:** Confirm HTML/CSS/JS load without errors (browser DevTools → Network tab)
3. **WebSocket connect:** Verify WS connection opens on page load (browser DevTools → Network → WS)
4. **FEED button:** Tap FEED, verify motor starts, status updates to "feeding"
5. **STOP button:** Tap STOP, verify motor stops
6. **Sliders:** Adjust auger speed, verify motor speed changes
7. **Sensor data:** Verify food level updates every `sensorInterval` ms
8. **Reconnect:** Kill WiFi, verify WS reconnects when signal returns
9. **Coexistence:** Verify BLE and web server can run simultaneously (BLE for app, web for browser)
10. **Station mode:** Configure home WiFi, access via mDNS `floyd-feeder-XXXX.local`

---

## 10. Future Enhancements (v2)

- **WiFiManager integration** — use existing provisioning portal to select web mode
- **Password-protected web UI** — basic auth for security
- **OTA updates** — firmware upload via web UI
- **SD card logging** — serve log files via web UI
- **Camera stream** — ESP32-CAM video feed alongside controls
- **PWA manifest** — "Add to Home Screen" support
- **Compressed HTML** — store gzipped HTML in PROGMEM for ~60% size reduction

---

## 11. Code Skeleton

### ESP32_WebServer.h (dashboard HTML)

```cpp
#ifndef ESP32_WEBSERVER_H
#define ESP32_WEBSERVER_H

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Floyd Feeder</title>
<style>
:root { --primary: #4CAF50; --secondary: #2196F3; --error: #f44336;
  --warning: #FF9800; --bg: #0d1117; --card: #161b22;
  --text: #e6edf3; --text2: #8b949e; --border: #30363d; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg); color: var(--text); padding: 16px; }
/* ... full responsive CSS for the dashboard ... */
</style>
</head>
<body>
<div id="app">
  <header><!-- title + connection status dot --></header>
  <section class="status-cards"><!-- food %, motor, uptime --></section>
  <section class="controls"><!-- sliders + buttons --></section>
  <section class="schedule"><!-- schedule list --></section>
</div>
<script>
const WS_URL = `ws://${location.hostname}:81/ws`;
let ws = null;
let state = {};
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    updateState(msg);
  };
  ws.onclose = () => setTimeout(connect, 1000);
}
function send(action, params) {
  ws.send(JSON.stringify({ action, parameters: params }));
}
// ... full JS for sliders, buttons, state rendering ...
connect();
</script>
</body>
</html>
)rawliteral";

#endif
```

### Integration in main sketch (key snippets)

```cpp
// Near top includes:
#include <ESPAsyncWebServer.h>
#include "ESP32_WebServer.h"

// Globals:
AsyncWebServer webSrv(80);
AsyncWebSocket webWs("/ws");
bool webMode = false;

// WebSocket event handler:
void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    StaticJsonDocument<768> doc;
    buildDeviceStatusJson(doc);
    String json; serializeJson(doc, json);
    client->text(json);
  }
  if (type == WS_EVT_DATA) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len) {
      String msg((char*)data, len);
      pendingCommandPayload = msg;
      pendingCommand = true;
    }
  }
}

// Init function:
void initWebServer() {
  webSrv.on("/", HTTP_GET, [](AsyncWebServerRequest *r) {
    r->send_P(200, "text/html", INDEX_HTML);
  });
  webWs.onEvent(onWsEvent);
  webSrv.addHandler(&webWs);
  webSrv.begin();
  Serial.println("Web server: http://" + WiFi.softAPIP().toString());
}

// In setup():
if (webMode) initWebServer();

// In loop():
if (webMode) {
  webWs.cleanupClients();
}

// Broadcast to WS in addition to existing transports:
void wsBroadcast(const String &json) {
  if (webMode) webWs.textAll(json);
}
// Call wsBroadcast() from broadcastResponse(), broadcastSensorData(), etc.
```

---

## 12. Decision Summary

| #   | Decision         | Choice                               | Rationale                                      |
| --- | ---------------- | ------------------------------------ | ---------------------------------------------- |
| 1   | Library          | `ESPAsyncWebServer`                  | Non-blocking, WebSocket support, async         |
| 2   | HTML storage     | PROGMEM string                       | No filesystem upload step needed               |
| 3   | Real-time        | WebSockets                           | Bidirectional, low-latency, push-capable       |
| 4   | WiFi mode        | SoftAP default + STA opt-in          | Works out of box, WiFi config is optional      |
| 5   | Command reuse    | Same `handleMQTTMessage()`           | Zero new command parsing, proven protocol      |
| 6   | Response routing | `ws.textAll()` in existing broadcast | Minimal code changes, all transports work      |
| 7   | UI framework     | Vanilla JS + CSS                     | ~15KB total, no build step, no CDN deps        |
| 8   | Security         | No auth (v1)                         | LAN/WPAN assumed trusted; add basic auth in v2 |
| 9   | Coexistence      | Web + BLE simultaneously             | App still works via BLE, web via WiFi          |
| 10  | Schedules        | Read-only in v1, full CRUD in v2     | Schedule editing is complex in HTML forms      |
