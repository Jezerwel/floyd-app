# Floyd Feeder — ESP32 Setup Guide

MQTT-based firmware for the ESP32 fish feeder with L298N motor driver, HC-SR04 ultrasonic, and DS18B20 temperature sensor.

---

## Required Components

| Item                                          | Qty    |
| --------------------------------------------- | ------ |
| ESP32 NodeMCU (ESP-12E)                       | 1      |
| L298N Dual H-Bridge Motor Driver              | 1      |
| HC-SR04 Ultrasonic Sensor                     | 1      |
| DS18B20 Temperature Sensor (TO-92)            | 1      |
| DC Motors — Auger + Impeller (12V, 200-800mA) | 2      |
| 12V 2A DC Power Supply                        | 1      |
| 5V 1A USB Power Adapter                       | 1      |
| Resistors: 1kΩ, 2kΩ, 4.7kΩ                    | 1 each |
| Capacitors: 100µF electrolytic, 0.1µF ceramic | 1, 2   |
| Jumper wires + breadboard                     | ~20    |

---

## Arduino IDE Setup

### 1. Board Support

```
5. Add ESP32 board URL to Arduino IDE:
   - File → Preferences → Additional Boards Manager URLs: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → Search "esp32" → Install "ESP32 Arduino"
```

### 2. Required Libraries

| Library                       | Version             | Purpose                          |
| ----------------------------- | ------------------- | -------------------------------- |
| NimBLE-Arduino                | (board package)     | BLE GATT server — **enable NimBLE in Arduino ESP32 tools** |
| ArduinoJson (Benoit Blanchon) | v7.x                | JSON message parsing             |
| sMQTTBroker (terrorsl)        | compatible w/ sketch | Embedded broker (SoftAP mode)   |
| WiFi.h                        | (built-in)          | SoftAP in fallback mode        |

Captive-portal WiFiManager, ESPmDNS, and ezTime are **not** used in the current `ESP32_MQTT_Server.ino` revision. Time sync comes from the mobile app (BLE time characteristic or MQTT when in AP mode).

> **OneWire warning:** not applicable (DS18B20 not connected)

### 3. Flash Firmware

1. Open `ESP32_MQTT_Server.ino` in Arduino IDE
2. Select COM port under _Tools → Port_
3. Set baud rate: `115200`, Flash Size: `4MB (FS:1MB OTA:~1019KB)`
4. **Upload** (Ctrl+U)
5. Open Serial Monitor (115200 baud) to watch boot sequence

---

## Wiring

### L298N → ESP32

| L298N | ESP32           | Function             |
| ----- | --------------- | -------------------- |
| ENA   | GPIO14 (GPIO14) | Auger PWM speed      |
| IN1   | GPIO12 (GPIO12) | Auger Direction 1    |
| IN2   | GPIO13 (GPIO13) | Auger Direction 2    |
| ENB   | GPIO0 (GPIO0)   | Impeller PWM speed   |
| IN3   | GPIO15 (GPIO15) | Impeller Direction 3 |
| IN4   | GPIO16 (GPIO16) | Impeller Direction 4 |
| 12V   | —               | 12V PSU positive     |
| GND   | —               | Shared ground bus    |

**Critical:** Remove ENA/ENB jumper caps for PWM control. Leave 5V enable jumper in place.

### HC-SR04 → ESP32

| HC-SR04 | ESP32         | Note                        |
| ------- | ------------- | --------------------------- |
| VCC     | 5V (VU)       | 5V required                 |
| TRIG    | GPIO5 (GPIO5) | 10µs pulse                  |
| ECHO    | GPIO4 (GPIO4) | Via 1kΩ→2kΩ voltage divider |
| GND     | GND           | Shared ground               |

**NOTE:** HC-SR04 ultrasonic sensor is not currently connected

### DS18B20 → ESP32

| DS18B20 | ESP32         | Note                  |
| ------- | ------------- | --------------------- |
| VDD     | 3.3V          |                       |
| DQ      | GPIO2 (GPIO2) | 4.7kΩ pull-up to 3.3V |
| GND     | GND           | Shared ground         |

**NOTE:** DS18B20 temperature sensor is not currently connected

---

## Provisioning (First Boot)

1. Power on ESP32 — it boots as SoftAP `FloydFeeder-{chipId}`
2. Connect phone to that WiFi network (no password)
3. Open Floyd app → provisioning screen
4. WebView loads `192.168.4.1` (WiFiManager portal)
5. Select home WiFi, enter password, tap Save
6. ESP reboots → connects to home WiFi → connects to MQTT broker
7. App extracts chipId, calls `POST /api/devices/claim`
8. Dashboard shows live sensor data

---

## MQTT Topics

| Topic                              | Direction | Purpose                     |
| ---------------------------------- | --------- | --------------------------- |
| `floyd/devices/{chipId}/telemetry` | ESP → App | Sensor data                 |
| `floyd/devices/{chipId}/status`    | ESP → App | Connection state (retained) |
| `floyd/devices/{chipId}/command`   | App → ESP | Feed/stop/jam/ping commands |
| `floyd/devices/{chipId}/response`  | ESP → App | Command acknowledgments     |
| `floyd/devices/{chipId}/config`    | App → ESP | Container geometry updates  |

---

## Troubleshooting

### ESP won't boot

- GPIO15 (GPIO15) must be LOW — check L298N IN3 connection
- GPIO0 (GPIO0) must be HIGH — check for pull-ups
- GPIO2 (GPIO2) pulled LOW? 4.7kΩ pull-up to 3.3V required

### Motors don't move

- ENA/ENB jumper caps removed? (required for PWM)
- Shared ground connected? (L298N GND ≡ ESP GND ≡ PSU GND)
- L298N 5V enable jumper in place?

### HC-SR04 reads 0 or max

- VCC connected to 5V (not 3.3V)?
- ECHO voltage divider wired correctly?
- Sensor facing downward with clear acoustic cone?

### DS18B20 reads 85°C

- not applicable (DS18B20 not connected)

### MQTT won't connect

- Check Serial Monitor for broker IP
- The ESP32 runs an embedded broker on port 1883 — no external broker needed
- Verify the app and ESP32 are on the same WiFi network
- Check that mDNS is working: `dns-sd -B _mqtt._tcp local.` should show `floyd-feeder-{chipId}`
