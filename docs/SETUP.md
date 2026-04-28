# Floyd Feeder v2 — Hardyware & Device Setup

Setup for connecting the ESP8266 + L298N motor driver to the Floyd Feeder cloud system.

---

## Connection Flow

```
1. ESP8266 boots → connects to WiFi
2. ESP8266 opens WebSocket to cloud server (floyd-feeder.up.railway.app)
3. Cloud server (Express + ws) proxies commands ESP8266 ↔ app
4. React Native app connects via WebSocket + REST API to same server
```

---

## 1. Hardware

### Components

| Part | Purpose |
|------|---------|
| ESP8266 (NodeMCU) | WiFi + control logic |
| L298N Motor Driver | Drives auger (MOTOR A) + impeller (MOTOR B) |
| HCSR04 Ultrasonic | Food level measurement |
| DS18B20 | Water temperature sensor |
| 12V DC 2A supply | Powers L298N motors |

### Wiring

```
ESP8266          L298N Motor Driver
-------          ------------------
D5 (GPIO14)  →   ENA  (Auger PWM)
D6 (GPIO12)  →   IN1  (Auger Dir)
D7 (GPIO13)  →   IN2  (Auger Dir)
D3 (GPIO0)   →   ENB  (Impeller PWM)
D8 (GPIO15)  →   IN3  (Impeller Dir)
D0 (GPIO16)  →   IN4  (Impeller Dir)

ESP8266          HCSR04 Ultrasonic
-------          -----------------
D1 (GPIO5)   →   TRIG
D2 (GPIO4)   →   ECHO
VIN (5V)     →   VCC
GND          →   GND

ESP8266          DS18B20 Temp Sensor
-------          -------------------
D4 (GPIO2)   →   DATA (with 4.7kΩ pull-up to 3.3V)
3.3V         →   VCC
GND          →   GND
```

### Power

| Component | Supply | Notes |
|-----------|--------|-------|
| ESP8266 | USB 5V (phone charger) | Powers the microcontroller only |
| L298N | 12V DC 2A barrel jack | **Do not** power motors from ESP8266's 3.3V or USB |
| L298N +12V terminal → motors | 12V from L298N's OUT1/OUT2/OUT3/OUT4 | Motors draw from L298N, not ESP8266 |

**Warning:** The ESP8266's 3.3V pin cannot supply enough current for motors. Always use the L298N's dedicated 12V power input for driving auger and impeller.

---

## 2. Firmware (ESP8266)

### 2.1 Edit Credentials

Open `ESP8266_WebSocket_Server.ino` in Arduino IDE. Update lines 12-14:

```cpp
#define WIFI_SSID "YourWiFiName"
#define WIFI_PASSWORD "YourWiFiPassword"
```

If you deployed your own cloud server (not using `floyd-feeder.up.railway.app`), update the host in the `connectToServer()` function (search for `f1oyd-feeder.up.railway.app`).

### 2.2 Flash

1. Select board: **NodeMCU 1.0 (ESP-12E Module)** in Tools → Board
2. Select the correct COM port
3. Click **Verify** (checkmark) — should compile without errors
4. Click **Upload** (right arrow)

### 2.3 Confirm IP

After upload, open **Tools → Serial Monitor** (115200 baud). You should see:

```
=== Floyd Fish Feeder v2 -- L298N Motor Driver ===
WiFi connected: 192.168.x.x
WebSocket connected to cloud server
```

**Note the IP address** (e.g., `192.168.1.42`). You'll need it for the server.

---

## 3. Server (Cloud)

### 3.1 Prerequisites

```bash
cd server
npm install
npx prisma migrate dev
```

This creates `prisma/floyd.db` (SQLite database with FeedSchedule, FeedLog, AlertConfig tables).

### 3.2 Configure ESP8266 IP

Create `server/.env`:

```
ESP8266_HOST=192.168.x.x
```

Replace `192.168.x.x` with the IP from Serial Monitor (step 2.3).
Default is `172.31.5.134` if env var is not set.

### 3.3 Deploy to Railway

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Link: `railway link` (inside server/)
4. Deploy: `railway up`

Note your Railway URL (e.g., `floyd-feeder.up.railway.app`).

If your URL differs, update these 4 locations:

| File | Line | What to change |
|------|------|----------------|
| `ESP8266_WebSocket_Server.ino` | ~840 | WebSocket host in `connectToServer()` |
| `hooks/useESP8266Context.tsx` | 72 | `CLOUD_SERVER_URL` |
| `services/api.ts` | 1 | `CLOUD_SERVER` |
| `app/(tabs)/schedule.tsx` | 22 | `CLOUD_SERVER` |
| `app/(tabs)/history.tsx` | 39 | `CLOUD_SERVER` |

### 3.4 Verify

```bash
curl https://YOUR-APP.up.railway.app/health
# → {"status":"healthy","mode":"proxy","esp8266":{"connected":true}}
```

---

## 4. App (React Native)

### 4.1 Run

```bash
npm install
npx expo start --clear
```

Scan QR with Expo Go, or press `w` for web.

### 4.2 Connect to ESP8266

The app auto-connects to the cloud server via WebSocket (`wss://floyd-feeder.up.railway.app`). If you deployed your own server, update `hooks/useESP8266Context.tsx` line 72.

---

## 5. Quick Test

Verify everything works:

| Step | What to check | Expected |
|------|---------------|----------|
| 5.1 | Open **Dashboard** tab | Shows motor status (idle) and WiFi RSSI |
| 5.2 | Open **Controls** tab | FEED button enabled, sliders responsive |
| 5.3 | Press **FEED** | Motor status changes → pre_spin → feeding → post_spin → idle |
| 5.4 | Open **Schedule** tab | Schedule list loads (empty initially) |
| 5.5 | Create a schedule | POST succeeds, schedule appears in list |
| 5.6 | Open **Logs** tab | Toggle to server history — logs appear after feed |

### Troubleshooting

| Problem | Check |
|---------|-------|
| ESP8266 not connecting | WiFi credentials correct? Serial Monitor shows IP? |
| Server shows `esp8266.connected: false` | ESP8266_HOST in server/.env matches Serial Monitor IP? ESP8266 on same network as server? |
| App shows no data | Server running? `curl /health` returns 200? WebSocket URL in `useESP8266Context.tsx` correct? |
| Motor not spinning | 12V power connected to L298N? L298N LED on? Wiring matches table? |
| **DO NOT** power L298N from ESP8266 | Motors need separate 12V DC supply to L298N's power terminal |
