# Floyd Fish Feeder — Manual Setup Guide

**Version 2.0 · 2026.05**

A complete walkthrough for bringing Floyd v2 online — from cloud broker to PCB. Covers HiveMQ Cloud, Railway server deployment, Expo mobile build, and ESP8266 hardware wiring with L298N motor driver, HC-SR04 ultrasonic, and DS18B20 temperature sensor.

---

## Contents

1. [Executive Summary](#01-executive-summary)
2. [Software Setup — Cloud & Infrastructure](#02-software--cloud--infrastructure)
3. [Software Setup — Server (Local/Dev)](#03-software--server-localdev)
4. [Software Setup — Mobile App](#04-software--mobile-app)
5. [Electronics Setup — Firmware & Libraries](#05-electronics--firmware--libraries)
6. [Electronics Setup — Motor & Sensor Wiring](#06-electronics--motor--sensor-wiring)
7. [Electronics Setup — Power & Enclosure](#07-electronics--power--enclosure)
8. [Electronics Setup — First-Boot Provisioning](#08-electronics--first-boot-provisioning)
9. [Appendix — Pin Reference, Wiring Schematic, Environment Variables](#09-appendix)

---

## 01 Executive Summary

Floyd Fish Feeder v2 has migrated from a local WebSocket proxy architecture to a **cloud MQTT** design. This document covers every manual step required after the code has been pulled — categorized by **Software** (what you configure on screens) and **Electronics** (what you wire with your hands). No step requires code changes; all configuration is via environment variables, Arduino Library Manager installs, and physical wiring.

The architecture has three software components and one hardware component, all connected through HiveMQ Cloud MQTT: the ESP8266 publishes telemetry and subscribes to commands, the mobile app publishes commands and subscribes to telemetry, and the Express server handles REST APIs and cron-based scheduled feeding — with no real-time message relaying.

### Prerequisites Checklist

- GitHub repository cloned locally (`floyd-app`)
- Arduino IDE installed (tested with v2.x)
- Node.js v20+ and npm available on the server machine
- Expo CLI and EAS CLI available for mobile builds
- ESP8266 NodeMCU (e.g., ESP-12E, Wemos D1 Mini) on hand
- L298N motor driver module, HC-SR04 ultrasonic sensor, DS18B20 temperature sensor
- 12V DC power supply for motors, 5V USB power for ESP8266

> **Estimated Setup Time:** First-time setup: approximately **2–3 hours**. Subsequent device provisioning: **5 minutes** per feeder.

---

## 02 Software — Cloud & Infrastructure

Three cloud services must be provisioned before the feeder can operate: **HiveMQ** as the MQTT broker, **Railway** to host the Express server, and the Expo mobile app built for your target device.

---

### 1. HiveMQ — MQTT Broker

HiveMQ is the central nervous system. All three participants — ESP8266, mobile app, and server — publish and subscribe through MQTT topics under `floyd/devices/{chipId}/`. None of them talk to each other directly; the broker routes every message.

You have **two options** for the broker. Choose one.

> **Recommendation:** Start with Option A (public broker, zero setup). Switch to Option B (dedicated cluster) when you need isolation, credentials, or want to deploy more than 2–3 feeders.

---

#### Option A: Public HiveMQ Broker (Recommended for First-Time Setup)

HiveMQ operates a free, open MQTT broker at `broker.hivemq.com`. It requires **no account, no credentials, no console setup**. Anyone can connect and publish/subscribe to any topic — including your `floyd/devices/...` topics.

| Detail | Value |
|---|---|
| **MQTT host** | `broker.hivemq.com` |
| **Plain MQTT port** | `1883` (used by server + ESP8266) |
| **MQTT over TLS port** | `8883` (used by mobile app) |
| **WebSocket port** | `8000` |
| **Authentication** | None (anonymous) |
| **TLS certificate** | Public CA-signed (LetsEncrypt) |
| **Rate limits** | None published; generous for a single device |
| **Persistence / retained messages** | Supported |
| **Uptime / SLA** | Best-effort (no SLA) |

**Action required:** Nothing. The firmware, server, and app all default to `broker.hivemq.com`. If you accept the public broker, skip directly to the Railway section below.

**Security note:** Anyone who knows your chipId can subscribe to your telemetry or publish commands to your feeder if you use the public broker. The topic namespace `floyd/devices/{chipId}/...` is effectively your only protection. If security matters, use Option B.

---

#### Option B: Dedicated HiveMQ Cloud Cluster (Production)

A dedicated cluster gives you an isolated namespace that nobody else can reach, plus username/password authentication. The free **Serverless** tier is enough for a handful of feeders.

> **TLS is mandatory for dedicated clusters.** HiveMQ Cloud Serverless and Starter tiers **only accept TLS connections** on port `8883`. There is no plain MQTT port `1883`. This means:
> - **Server** (Node.js/mqtt.js): fine — `mqtts://` with TLS is trivial.
> - **Mobile app** (React Native): fine — the app already uses `mqtts://`.
> - **ESP8266 firmware**: **problematic** — TLS on ESP8266 requires 40–50KB of free heap during handshake, which is very tight on this chip. See the firmware changes section below for known limitations.

| Detail | Value |
|---|---|
| **MQTT host** | Your cluster URL (e.g., `x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud`) |
| **MQTT port** | `8883` (TLS only — no plain MQTT) |
| **WebSocket port** | `8884` |
| **Authentication** | Username + password (required) |
| **TLS** | Mandatory — SNI (Server Name Indication) required |
| **Rate limits** | 100 connections, 10 GB data/month (Serverless free tier) |
| **Persistence / retained messages** | Supported |
| **Uptime / SLA** | No SLA on free tier |

##### Step B1 — Create Your HiveMQ Account

1. Open a browser and go to `https://console.hivemq.cloud`.
2. Click **Sign up** in the top-right corner.
3. Fill in your email, a password, and your name. HiveMQ sends a verification email — check your inbox (and spam folder) and click the link.
4. After verification, you land on the **Clusters** dashboard (empty on first visit).

##### Step B2 — Create the Serverless Cluster

1. On the Clusters dashboard, click the **Create Cluster** button (top-right, green).
2. You will see three tier options: **Serverless** (free), **Starter** (paid), and **Professional** (paid). Select **Serverless**.
3. **Choose a cloud provider and region:**
   - **AWS** (us-east-1, eu-west-1, ap-southeast-1) — most regions available
   - **Azure** (fewer regions)
   - Pick the region physically closest to where your feeder and phone will be. For a home feeder in North America, choose `us-east-1`. For Europe, `eu-west-1`.
4. **Cluster name** — Enter something like `floyd-feeders`. This is cosmetic; it appears in the console only.
5. Click **Create Cluster**. The spinner runs for ~30–60 seconds while HiveMQ provisions your cluster. Do not close the tab.
6. When done, the cluster card shows a green **Running** badge and your cluster URL underneath.

##### Step B3 — Find Your Cluster URL

After the cluster is provisioned, you will see a box with connection details. It looks like this:

```
Cluster URL: x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud
MQTT Port:   8883  (TLS only — no plain-text MQTT on dedicated clusters)
WebSocket Port: 8884
```

**Write down the Cluster URL.** You will need it in every configuration step that follows. The full MQTT broker URL you will use is:

```
mqtts://x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud:8883
```

> **Important:** Dedicated HiveMQ Cloud clusters **only support TLS** (port 8883). There is no plain-text MQTT port 1883. The ESP8266 must be able to make TLS connections — see the firmware notes below.

##### Step B4 — Create MQTT Credentials

HiveMQ Cloud requires username/password authentication. You need at least one set of credentials that the server, app, and ESP8266 will all share (or you can create separate credentials per client for fine-grained access control).

1. In the left sidebar, click **Access Management** (key icon).
2. Click the **Add Credentials** button.
3. Fill in:
   - **Username** — e.g., `floyd-server` (for the Railway server) or `floyd-device` (shared by all components).
   - **Password** — generate a strong password (HiveMQ has a built-in generator button). **Copy and save it immediately** — HiveMQ only shows the password once during creation. You cannot retrieve it later.
   - **Permissions** — the default `PUBLISH` and `SUBSCRIBE` are sufficient. You can leave the topic filter blank to grant access to all topics, or restrict it to `floyd/devices/#` for tighter security.
4. Click **Create**. The credential appears in the list.

If you want separate credentials per component (recommended for production with multiple feeders):

| Username | Used By | Publish To | Subscribe To |
|---|---|---|---|
| `floyd-server` | Railway Express server | `floyd/devices/+/command` | `floyd/devices/+/telemetry`, `+/status`, `+/response` |
| `floyd-app` | Mobile app | `floyd/devices/+/command`, `+/config` | `floyd/devices/+/telemetry`, `+/status`, `+/response` |
| `floyd-esp` | ESP8266 firmware | `floyd/devices/+/telemetry`, `+/status`, `+/response` | `floyd/devices/+/command`, `+/config` |

For your first setup, **one shared credential is fine**.

##### Step B5 — What Changes When Using a Dedicated Cluster

The code defaults to the public broker. You must change three things:

**Server (`.env` or Railway Variables):**

```env
MQTT_BROKER_URL=mqtts://x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=floyd-server
MQTT_PASSWORD=your-generated-password-here
```

The server reads `MQTT_USERNAME` and `MQTT_PASSWORD` from env vars in `server/src/services/mqttClient.ts:30–36`. If both are set, the MQTT client passes them as connection options.

**Mobile App (`.env` in project root):**

```env
EXPO_PUBLIC_MQTT_BROKER_URL=mqtts://x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud:8883
```

The app reads `EXPO_PUBLIC_MQTT_BROKER_URL` in `hooks/useMQTT.ts:15`. Currently the app's MQTT client does **not** pass username/password — if you need per-client auth for the app, you must add `username` and `password` to the `mqtt.connect()` options in `hooks/useMQTT.ts`.

**ESP8266 Firmware (`ESP8266_MQTT_Server.ino`):**

> **This is the hard part.** TLS on ESP8266 is well-documented as unreliable. A TLS handshake consumes 40–50KB of free heap on a chip that has ~80KB total. Community reports describe frequent OOM crashes, handshake timeouts, and connection drops after large messages. See: Espressif issue #6618, PubSubClient issue #462, ESP8266_RTOS_SDK issue #1101.

The firmware needs **three** changes:

**Change 1 — Broker hostname** in `startProvisioningMode()` at line 264:

```cpp
// Before:
strncpy(savedMqttBroker, "broker.hivemq.com", 63);

// After:
strncpy(savedMqttBroker, "x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud", 63);
```

**Change 2 — Server config with credentials + TLS port** in `configureMQTTClient()` at line 277:

```cpp
// Before:
mqttClient.setMqttServer(savedMqttBroker, "", "", 1883);

// After:
mqttClient.setMqttServer(savedMqttBroker, "floyd-esp", "your-password", 8883);
```

**Change 3 — Enable SSL** — The current firmware uses `WiFiClient` (plain TCP). For TLS, construct with `WiFiClientSecure` instead. Near the top of the sketch, replace:

```cpp
// Before:
WiFiClient wifiClient;

// After:
#include <WiFiClientSecure.h>
BearSSL::WiFiClientSecure wifiClient;
```

Then before connecting, add:

```cpp
wifiClient.setInsecure();  // Skips cert validation — needed because ESP8266 cannot store the full HiveMQ CA chain
```

**Before deploying**, test TLS stability over 24+ hours. If the ESP8266 drops connections or fails to reconnect after WiFi interruptions, fall back to the public broker (Option A) which uses plain TCP on port 1883 — no TLS overhead.

##### Step B6 — Verify the Broker is Reachable

Before wiring up your code, confirm the broker accepts connections:

**With MQTT Explorer (desktop GUI, recommended):**
1. Download MQTT Explorer from `https://mqtt-explorer.com`.
2. Add a new connection:
   - **Name:** `Floyd HiveMQ`
   - **Protocol:** `mqtts://`
   - **Host:** your cluster URL (e.g., `x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud`)
   - **Port:** `8883`
   - **Username / Password:** your credentials from Step B4
   - **Validate Certificate:** checked
3. Click **Connect**. You should see a green connection indicator and an empty topic tree.
4. Try publishing to `floyd/test` with payload `{"hello":"world"}` — it should appear in the topic tree.

**With mosquitto_pub / mosquitto_sub (CLI):**

```bash
# Subscribe in one terminal
mosquitto_sub -h x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud -p 8883 \
  -u floyd-server -P your-password \
  -t "floyd/devices/#" -v

# Publish in another terminal
mosquitto_pub -h x1a2b3c4d5e6f7g8h9.s1.eu.hivemq.cloud -p 8883 \
  -u floyd-server -P your-password \
  -t "floyd/test" -m '{"hello":"world"}'
```

If both commands succeed, your broker is reachable and credentials work. Move on to the component configuration steps below.

---

#### MQTT Topic Architecture (Both Options)

Regardless of which broker you use, the topic structure is identical:

```
floyd/
└── devices/
    └── {chipId}/           ← e.g. "A1B2C3" (ESP.getChipId() as hex)
        ├── telemetry       ← ESP publishes sensor data (temp, distance, food %)
        ├── status          ← ESP publishes connection state (retained)
        ├── command         ← App + Server publish feed/jam-clear/sensor-query
        ├── response        ← ESP publishes command results (feed_complete, etc.)
        └── config          ← App publishes geometry/interval changes
```

| Topic | QoS | Retained | Publisher | Subscribers |
|---|---|---|---|---|
| `floyd/devices/{chipId}/telemetry` | 0 | No | ESP8266 | App, Server |
| `floyd/devices/{chipId}/status` | 0 | Yes (true) | ESP8266 | App, Server |
| `floyd/devices/{chipId}/command` | 0 | No | App, Server | ESP8266 |
| `floyd/devices/{chipId}/response` | 0 | No | ESP8266 | App, Server |
| `floyd/devices/{chipId}/config` | 0 | No | App | ESP8266 |

QoS 0 (fire-and-forget) is used throughout because:
- The ESP8266 publishes telemetry every few seconds — losing one reading is harmless.
- Commands that get lost can be retried from the app.
- QoS 1 or 2 would add memory and latency overhead that the ESP8266 cannot spare.

---

### 2. Railway — Server Hosting

The Express server (`server/`) must be deployed to Railway and connected to the MQTT broker. It provides REST APIs for device claiming, feed scheduling, feed history, and alert configuration.

#### Step 2.1: Deploy via Railway dashboard

1. Log in to `https://railway.app` and create a new project.
2. Connect the GitHub repository. Set the root directory to `server/`.
3. Railway auto-detects the Node.js build from `package.json`. The start command is `npm start` — verify this runs your `server.ts` entrypoint (compiled to `dist/` or via `tsx`).
4. Add a volume mount for the SQLite database file to persist data across deploys: mount a volume at `/app/server/prisma` (or wherever `floyd.db` lives).

#### Step 2.2: Set environment variables

In the Railway project dashboard, go to *Variables* and add:

```
PORT=3001
DATABASE_URL=file:./prisma/floyd.db
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
```

If using a dedicated HiveMQ cluster with authentication, also add:

```
MQTT_BROKER_URL=mqtts://xxxxx.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=your-device-username
MQTT_PASSWORD=your-device-password
```

#### Step 2.3: Run database migration

After the first deploy, SSH into the Railway instance or use the Railway CLI to run the Prisma migration:

```bash
npx prisma migrate deploy
```

This applies the `20260501140214_add_device_model` migration, creating the Device table alongside FeedSchedule, FeedLog, and AlertConfig.

#### Step 2.4: Verify the deployment

Hit the health endpoint: `GET https://your-railway-url.up.railway.app/health`. You should see a JSON response with server uptime and MQTT connection status.

---

## 03 Software — Server (Local/Dev)

For development or self-hosting on a VPS, run the server locally. These steps are **not needed** if you deployed to Railway as described in Section 02.

### 1. Install dependencies

```bash
cd server/
npm install
```

Installs `mqtt@^5.15.1`, `@prisma/client`, `express`, `node-cron`, and their transitive dependencies.

### 2. Create environment file

```bash
# server/.env
PORT=3001
DATABASE_URL=file:./prisma/floyd.db
MQTT_BROKER_URL=mqtt://broker.hivemq.com:1883
```

### 3. Apply database migration

```bash
npx prisma migrate deploy
```

Creates the SQLite database at `server/prisma/floyd.db` with all four models: Device, FeedSchedule, FeedLog, and AlertConfig.

### 4. Start the server

```bash
npm run dev    # tsx watch — auto-reload on changes
# or
npm start      # production — runs compiled JS
```

The server initializes the MQTT client on startup, connects to the broker, and begins listening for cron-triggered feed schedules. The Express API is available at `http://localhost:3001`.

> **Note:** The server no longer hosts a WebSocket proxy. The `server/src/services/esp8266Client.ts` and `server/src/websocket/` directory have been removed. Real-time communication flows through MQTT directly.

---

## 04 Software — Mobile App

The React Native / Expo app connects directly to the MQTT broker (no proxy). It requires native modules for WebView provisioning and MQTT transport. A **full rebuild** is mandatory after dependency changes.

### 1. Install dependencies

```bash
# From the project root (floyd-app/)
npm install
```

Key app dependencies:
- `mqtt@^5.15.1` — MQTT client with Hermes-compatible native timer
- `react-native-webview` — embedded browser for WiFiManager captive portal
- `react-native-quick-base64` — fast Base64 for MQTT payloads on Hermes
- `@react-native-async-storage/async-storage` — persist chipId and MQTT password
- `expo-router` — file-based navigation

### 2. Environment variable (optional)

If not using the public HiveMQ broker, create `.env` in the project root:

```
EXPO_PUBLIC_MQTT_BROKER_URL=mqtts://your-cluster.s1.eu.hivemq.cloud:8883
```

The default is `mqtts://broker.hivemq.com:8883` — no env file needed for public broker usage.

### 3. Configure the API server URL

In `services/api.ts`, confirm `CLOUD_SERVER` points to your deployed Railway URL or local IP:

```ts
const CLOUD_SERVER = "https://your-app.up.railway.app";
```

### 4. Rebuild the app (mandatory)

Native modules (`react-native-webview`, `react-native-quick-base64`) require a clean prebuild and native compilation. Do not rely on Expo Go for production.

```bash
# Clean rebuild
npx expo prebuild --clean

# Android
npx expo run:android

# iOS
npx expo run:ios
```

For EAS builds (recommended for distribution):

```bash
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

> **Note:** The app includes a `process.nextTick` polyfill (in `hooks/useMQTT.ts`) for Hermes engine compatibility. Without it, the MQTT client emits *"Keepalive timeout"* errors on React Native. The polyfill is already wired — no manual action needed.

### 5. Verify the build

1. Install the app on a physical device or emulator.
2. On first launch, the app checks AsyncStorage for `floydChipId`. If absent, it shows the provisioning screen or prompts the user to provision a new device.
3. The app auto-connects to the MQTT broker when a chipId is available.

---

## 05 Electronics — Firmware & Libraries

The ESP8266 sketch (`ESP8266_MQTT_Server.ino`) is fully written. It is an **MQTT-based firmware** using PubSubClient for MQTT and WiFiManager for SoftAP provisioning. You only need to install libraries and flash.

### 1. Install Arduino Libraries

Open Arduino IDE, go to *Tools → Manage Libraries*, and install each of these at the specified version or latest:

| Library | Purpose | Recommended Version |
|---|---|---|
| **PubSubClient** | MQTT client for ESP8266 with keepalive, LWT, and QoS support. | v2.6+ |
| **WiFiManager** by tzapu | Captive portal provisioning — ESP boots as an AP, user connects phone and enters home WiFi credentials via a web form. | v2.0.17+ |
| **ArduinoJson** by Benoit Blanchon | JSON parsing and serialization for command/response messages over MQTT. | v7.x |
| **OneWire** | OneWire protocol for DS18B20 temperature sensor communication. | v2.3.8 |
| **DallasTemperature** | High-level interface for DS18B20 sensor reading and conversion. | v3.11.1 |
| **ESP8266WiFi** | Built-in with ESP8266 board package. WiFi client for station mode connection. | (board package) |
| **EEPROM** | Built-in. Persistent storage of WiFi credentials, MQTT password, sensor geometry, and calibration values. | (board package) |

> **Note:** The firmware uses raw PubSubClient with BearSSL WiFiClientSecure for TLS. Command flags are set inside the MQTT callback and published in `loop()` to avoid callback reentrancy issues.

### 2. Flash the firmware

1. Open `ESP8266_MQTT_Server.ino` in Arduino IDE.
2. Select the board: *Tools → Board → ESP8266 Boards → NodeMCU 1.0 (ESP-12E Module)* (adjust for your specific board).
3. Select the correct COM port under *Tools → Port*.
4. Set baud rate to `115200` and Flash Size to at least `4MB (FS:1MB OTA:~1019KB)`.
5. Press **Upload** (Ctrl+U).
6. Open the Serial Monitor (`115200` baud) to watch the boot sequence.

### 3. First-boot behavior

On first boot (empty EEPROM), the ESP8266 will:

1. Attempt to load saved WiFi credentials from EEPROM — fails (checksum mismatch).
2. Fall back to loading geometry-only config (container dimensions, sensor intervals).
3. Detect no WiFi connection → enter **provisioning mode** (SoftAP).
4. Broadcast an access point named `FloydFeeder-{chipId}` (e.g., `FloydFeeder-A1B2C3`).
5. Serve a captive portal at `192.168.4.1` where the user enters home WiFi credentials.

After provisioning, the ESP restarts, connects to home WiFi using the saved SSID/password, and auto-connects to the MQTT broker via PubSubClient.

---

## 06 Electronics — Motor & Sensor Wiring

The ESP8266 controls two DC motors through an L298N dual H-bridge driver and reads food level and temperature from HC-SR04 and DS18B20 sensors respectively. **All pin assignments are defined** in the firmware — do not change them without updating both the `#define` macros and the wiring.

### 1. L298N Motor Driver — Auger & Impeller

The L298N module drives two motors independently. Motor A controls the auger (food delivery screw). Motor B controls the impeller (food scattering spinner). PWM speed is controllable on both channels.

| L298N Pin | ESP8266 Pin | GPIO | Function | Suggested Wire Color |
|---|---|---|---|---|
| ENA | D5 | GPIO14 | Auger PWM speed (0–1023) | Orange |
| IN1 | D6 | GPIO12 | Auger direction 1 | Yellow |
| IN2 | D7 | GPIO13 | Auger direction 2 | Green |
| ENB | D3 | GPIO0 | Impeller PWM speed (0–1023) | Blue |
| IN3 | D8 | GPIO15 | Impeller direction 3 | Purple |
| IN4 | D0 | GPIO16 | Impeller direction 4 | Gray |
| VCC (12V) | — | — | External 12V power supply (+) terminal | Red |
| GND | — | — | Shared ground — connect to ESP8266 GND and power supply GND | Black |
| OUT1, OUT2 | — | — | Auger DC motor terminals | — |
| OUT3, OUT4 | — | — | Impeller DC motor terminals | — |

> **Critical: Shared ground.** The L298N GND, ESP8266 GND, and power supply GND must all be connected. Without a shared ground, motor PWM signals are floating and the motors will not respond or may behave erratically.

### 2. HC-SR04 Ultrasonic Distance Sensor — Food Level

The HC-SR04 measures the distance from the sensor head to the food surface inside the container. The firmware converts this to a fill percentage using the cylinder + frustum volume formula stored in EEPROM.

| HC-SR04 Pin | ESP8266 Pin | GPIO | Note |
|---|---|---|---|
| VCC | 5V (Vin / VU) | — | HC-SR04 works at 5V logic. ESP8266 GPIO is 3.3V tolerant on input but the TRIG pin outputs 3.3V — some HC-SR04 modules accept this. If unreliable, use a logic level shifter. |
| TRIG | D1 | GPIO5 | 10µs pulse triggers an 8-cycle ultrasonic burst. |
| ECHO | D2 | GPIO4 | Pulse width proportional to distance. **Use a voltage divider** (1kΩ + 2kΩ) to drop 5V ECHO to ~3.3V. Connecting 5V directly to GPIO4 can damage the ESP8266. |
| GND | GND | — | Shared ground. |

### 3. DS18B20 Temperature Sensor

The DS18B20 uses OneWire protocol on a single GPIO pin. A 4.7kΩ pull-up resistor is required between the data line and 3.3V.

| DS18B20 Pin | ESP8266 Pin | GPIO | Note |
|---|---|---|---|
| VDD | 3.3V | — | The sensor operates at 3.3V or 5V. Use 3.3V to avoid level conversion. |
| DQ (Data) | D4 | GPIO2 | OneWire data line. **4.7kΩ resistor** required between DQ and 3.3V as a pull-up. |
| GND | GND | — | Shared ground. |

> **GPIO2 (D4) on ESP8266 NodeMCU:** This pin has a built-in pull-up resistor and is used during boot to set flash mode. If the DS18B20 data line is pulled low at boot, the ESP8266 may fail to start. The 4.7kΩ pull-up to 3.3V mitigates this. If you encounter boot failures, try GPIO0 (D3) or GPIO14 (D5) and update the `ONE_WIRE_BUS` define.

---

## 07 Electronics — Power & Enclosure

The system requires two power rails: **5V USB** for the ESP8266 logic and sensors, and **12V DC** for the L298N motor driver. Proper power isolation prevents motor noise from resetting the microcontroller.

### 1. Power architecture

| Component | Voltage | Typical Current | Power Source |
|---|---|---|---|
| ESP8266 NodeMCU | 5V via USB / Vin | ~80 mA (idle), ~300 mA (WiFi TX) | USB power adapter (5V 1A minimum) |
| L298N Motor Driver (logic) | 5V (from ESP8266 VU or onboard regulator) | ~20 mA | ESP8266 5V pin *or* L298N onboard 5V regulator (remove jumper if using onboard) |
| L298N Motor Driver (motors) | 12V DC | 500 mA – 2A per motor (depends on load) | 12V 2A+ DC power supply |
| HC-SR04 | 5V | ~15 mA | ESP8266 5V pin |
| DS18B20 | 3.3V | ~1 mA | ESP8266 3.3V pin |
| Auger DC Motor | 12V | 200–800 mA (under load) | L298N OUT1/OUT2 terminals |
| Impeller DC Motor | 12V | 200–800 mA (under load) | L298N OUT3/OUT4 terminals |

> **Motor noise isolation:** Place a 100µF electrolytic capacitor across the 12V power input to the L298N, and a 0.1µF ceramic capacitor across each motor terminal pair. This suppresses voltage spikes that can reset the ESP8266. Keep motor power wires routed away from sensor signal wires.

### 2. Enclosure considerations

- The ESP8266 should be mounted away from the food container to avoid WiFi signal attenuation from metal components.
- The HC-SR04 ultrasonic sensor must be mounted **facing downward** into the food container, with an unobstructed cone for the ultrasonic beam (15° beam angle).
- The DS18B20 should be placed where it reads ambient temperature — not directly touching metal that could conduct heat from the motors.
- The L298N generates significant heat during continuous operation. Ensure ventilation or a small heatsink.
- If the enclosure is outdoors or in a high-humidity environment (e.g., above an aquarium), conformal-coat exposed PCB contacts or use a sealed enclosure with cable glands.

---

## 08 Electronics — First-Boot Provisioning

This is the ritual that links hardware to cloud. Run through it once per device. The provisioning flow uses the **WiFiManager captive portal** loaded inside a WebView in the Floyd mobile app.

### Step-by-step

1. **Power on the ESP8266.** On first boot (or after EEPROM wipe), the firmware detects no saved WiFi credentials and enters SoftAP mode. The onboard LED should blink rapidly.

2. **Open the Wi-Fi settings on your phone.** Look for a network named `FloydFeeder-XXXX` (where XXXX is the chip ID, e.g., `FloydFeeder-A1B2C3`). **Connect to it.** The password is not set (open AP).

3. **Open the Floyd app.** If no device is provisioned, it should show the provisioning screen. If it doesn't, navigate to the provisioning route (e.g., the app's `/provision` screen).

4. **The WebView loads the captive portal.** The app opens `http://192.168.4.1` inside a WebView. This is the WiFiManager configuration page served by the ESP8266.

5. **Select your home WiFi network and enter the password.** The captive portal scans for available networks. Select yours, enter the password, and tap *Save*.

6. **ESP8266 reboots.** WiFiManager saves the credentials to EEPROM, generates a random 8-character hex MQTT password, and restarts the ESP8266.

7. **ESP8266 connects to home WiFi.** After reboot, the ESP reads credentials from EEPROM, connects to your home WiFi within 30 seconds, and then auto-connects to the HiveMQ MQTT broker via PubSubClient.

8. **App extracts device info.** The injected JavaScript in the WebView captures the chipId and provisioning status from the WiFiManager page. It sends this back to React Native via `window.ReactNativeWebView.postMessage()`.

9. **App calls the server to claim the device.** The app sends a `POST /api/devices/claim` with the chipId, device name, and the MQTT password (extracted from the provisioning page or derived deterministically).

10. **Server registers the device and subscribes to telemetry.** The server creates a Device record in the database and subscribes to `floyd/devices/{chipId}/telemetry`, `/status`, and `/response` topics on the MQTT broker.

11. **App connects to MQTT.** The app saves the chipId to AsyncStorage, triggers the MQTT connection in the app context, and subscribes to the same topics. The dashboard should show live sensor data within seconds.

> **Re-provisioning:** To wipe saved credentials and return to provisioning mode, either: (a) call the `factory_reset` MQTT command, (b) clear EEPROM by uploading a blank sketch temporarily, or (c) hold a physical reset button wired to GPIO0 while powering on (if implemented in hardware).

### What the topics look like after provisioning

Once all three participants are connected, data flows through these MQTT topics (where `{chipId}` is the ESP's hex chip ID):

| Topic | Direction | Payload Example |
|---|---|---|
| `floyd/devices/{chipId}/telemetry` | ESP → App + Server | `{"type":"sensor_data","data":{"temperature":24.5,"distance":18.2,"foodLevelPercentage":73}}` |
| `floyd/devices/{chipId}/status` | ESP → App + Server | `{"type":"status","data":{"connected":true}}` |
| `floyd/devices/{chipId}/command` | App + Server → ESP | `{"action":"start_feed","augerSpeed":768,"impellerSpeed":1023,"preSpinMs":1500,"feedMs":3000,"postSpinMs":1500}` |
| `floyd/devices/{chipId}/response` | ESP → App + Server | `{"type":"control_response","data":{"action":"feed_complete","success":true,"motorState":"idle"}}` |

---

## 09 Appendix

### A. Complete Pin Reference

| ESP8266 Pin | GPIO | Connected To | Purpose |
|---|---|---|---|
| D0 | GPIO16 | L298N IN4 | Impeller Direction 4 |
| D1 | GPIO5 | HC-SR04 TRIG | Ultrasonic trigger pulse |
| D2 | GPIO4 | HC-SR04 ECHO (via divider) | Ultrasonic echo pulse width |
| D3 | GPIO0 | L298N ENB | Impeller PWM speed |
| D4 | GPIO2 | DS18B20 DQ (4.7kΩ pull-up) | OneWire temperature data |
| D5 | GPIO14 | L298N ENA | Auger PWM speed |
| D6 | GPIO12 | L298N IN1 | Auger Direction 1 |
| D7 | GPIO13 | L298N IN2 | Auger Direction 2 |
| D8 | GPIO15 | L298N IN3 | Impeller Direction 3 |
| GND | — | L298N GND, HC-SR04 GND, DS18B20 GND, 12V PSU GND | Common ground bus |
| 3.3V | — | DS18B20 VDD | Temperature sensor power |
| 5V (VU) | — | HC-SR04 VCC | Ultrasonic sensor power |

### B. Wiring Schematic (Text Reference)

```
ESP8266 NodeMCU           L298N Motor Driver
┌──────────────┐          ┌──────────────────────┐
│ D5 (GPIO14)  ├──────────┤ ENA    (Auger PWM)    │
│ D6 (GPIO12)  ├──────────┤ IN1    (Auger Dir 1)  │
│ D7 (GPIO13)  ├──────────┤ IN2    (Auger Dir 2)  │
│ D3 (GPIO0)   ├──────────┤ ENB    (Impeller PWM) │
│ D8 (GPIO15)  ├──────────┤ IN3    (Impeller Dir3)│
│ D0 (GPIO16)  ├──────────┤ IN4    (Impeller Dir4)│
│ GND          ├──────────┤ GND                   │
│              │          │ OUT1─── Auger Motor +  │
│              │          │ OUT2─── Auger Motor -  │
│              │          │ OUT3─── Impeller M +   │
│              │          │ OUT4─── Impeller M -   │
│              │          │ 12V──── 12V PSU +     │
└──────────────┘          └──────────────────────┘

ESP8266 NodeMCU           HC-SR04 Ultrasonic
┌──────────────┐          ┌──────────────┐
│ D1 (GPIO5)   ├──────────┤ TRIG         │
│ D2 (GPIO4)   ├──[1kΩ]───┤ ECHO  ───╮  │
│              │   │       │      [2kΩ]  │
│ GND          ├───┴───────┤ GND  ───╯  │
│ 5V (VU)      ├──────────┤ VCC         │
└──────────────┘          └──────────────┘
(Voltage divider: ECHO → 1kΩ → D2 → 2kΩ → GND drops 5V to ~3.3V)

ESP8266 NodeMCU           DS18B20 Temperature
┌──────────────┐          ┌──────────────┐
│ D4 (GPIO2)   ├──────────┤ DQ (Data)    │
│ 3.3V         ├──[4.7kΩ]─┤ DQ (pull-up) │
│ 3.3V         ├──────────┤ VDD          │
│ GND          ├──────────┤ GND          │
└──────────────┘          └──────────────┘

Common Ground Bus: ESP GND ≡ L298N GND ≡ HC-SR04 GND ≡ DS18B20 GND ≡ 12V PSU GND
12V PSU (+) → L298N 12V terminal
5V USB → ESP8266 micro-USB port
```

### C. Environment Variables Reference

| Variable | Where | Default | Required? |
|---|---|---|---|
| `PORT` | server/.env or Railway Variables | `3001` | No — defaults to 3001 |
| `DATABASE_URL` | server/.env or Railway Variables | `file:./prisma/floyd.db` | **Yes** — Prisma requires it |
| `MQTT_BROKER_URL` | server/.env or Railway Variables | `mqtt://broker.hivemq.com:1883` | No — defaults to public broker |
| `MQTT_USERNAME` | server/.env or Railway Variables | (empty) | No — only for private HiveMQ clusters |
| `MQTT_PASSWORD` | server/.env or Railway Variables | (empty) | No — only for private HiveMQ clusters |
| `EXPO_PUBLIC_MQTT_BROKER_URL` | app .env or expo config | `mqtts://broker.hivemq.com:8883` | No — defaults to public broker MQTTS |

### D. Build Verification Checklist

After completing all setup steps, verify each layer independently:

1. **MQTT broker:** Use MQTT Explorer or `mosquitto_sub` to connect to the broker and check that you can publish/subscribe on a test topic.
2. **Server:** Hit `/health` and `/api/devices` endpoints. The server should report MQTT connection status.
3. **ESP8266:** After provisioning, check the Serial Monitor at `115200` baud. You should see `[MQTT] Connected to broker` and periodic sensor broadcasts.
4. **App:** Open the app. After provisioning, the dashboard should show live temperature and food level readings. Tap a feed button — the ESP should activate the motors.
5. **Scheduled feed:** Create a schedule via the app's schedules API. Wait for the cron trigger — the ESP should execute a feed without any app interaction.

> **Done.** Your Floyd Fish Feeder is online. The app shows real-time sensor data. The server manages schedules. The ESP8266 runs autonomously. All communication flows through cloud MQTT — no WebSocket proxy, no local network dependency. **You can feed your fish from anywhere in the world.**
