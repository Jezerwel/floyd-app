# Floyd Feeder — ESP8266 Setup Guide

MQTT-based firmware for the ESP8266 fish feeder with L298N motor driver, HC-SR04 ultrasonic, and DS18B20 temperature sensor.

---

## Required Components

| Item | Qty |
|------|-----|
| ESP8266 NodeMCU (ESP-12E) | 1 |
| L298N Dual H-Bridge Motor Driver | 1 |
| HC-SR04 Ultrasonic Sensor | 1 |
| DS18B20 Temperature Sensor (TO-92) | 1 |
| DC Motors — Auger + Impeller (12V, 200-800mA) | 2 |
| 12V 2A DC Power Supply | 1 |
| 5V 1A USB Power Adapter | 1 |
| Resistors: 1kΩ, 2kΩ, 4.7kΩ | 1 each |
| Capacitors: 100µF electrolytic, 0.1µF ceramic | 1, 2 |
| Jumper wires + breadboard | ~20 |

---

## Arduino IDE Setup

### 1. Board Support

```
File → Preferences → Additional Board Manager URLs:
http://arduino.esp8266.com/stable/package_esp8266com_index.json

Tools → Board → Boards Manager → Search "esp8266" → Install
Tools → Board → ESP8266 Boards → NodeMCU 1.0 (ESP-12E Module)
```

### 2. Required Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| PubSubClient | latest | MQTT client |
| WiFiManager (tzapu) | v2.0.17+ | Captive portal provisioning |
| ArduinoJson (Benoit Blanchon) | v7.x | JSON message parsing |
| OneWire | v2.3.0 (NOT 2.3.5+) | DS18B20 protocol |
| DallasTemperature | v3.11.1 | DS18B20 high-level API |
| ESP8266WiFi | (built-in) | WiFi connectivity |

> **OneWire warning:** v2.3.5+ has a confirmed ESP8266 bug causing stuck 85°C readings. Use v2.3.0.

### 3. Flash Firmware

1. Open `ESP8266_MQTT_Server.ino` in Arduino IDE
2. Select COM port under *Tools → Port*
3. Set baud rate: `115200`, Flash Size: `4MB (FS:1MB OTA:~1019KB)`
4. **Upload** (Ctrl+U)
5. Open Serial Monitor (115200 baud) to watch boot sequence

---

## Wiring

### L298N → ESP8266

| L298N | ESP8266 | Function |
|-------|---------|----------|
| ENA | D5 (GPIO14) | Auger PWM speed |
| IN1 | D6 (GPIO12) | Auger Direction 1 |
| IN2 | D7 (GPIO13) | Auger Direction 2 |
| ENB | D3 (GPIO0) | Impeller PWM speed |
| IN3 | D8 (GPIO15) | Impeller Direction 3 |
| IN4 | D0 (GPIO16) | Impeller Direction 4 |
| 12V | — | 12V PSU positive |
| GND | — | Shared ground bus |

**Critical:** Remove ENA/ENB jumper caps for PWM control. Leave 5V enable jumper in place.

### HC-SR04 → ESP8266

| HC-SR04 | ESP8266 | Note |
|---------|---------|------|
| VCC | 5V (VU) | 5V required |
| TRIG | D1 (GPIO5) | 10µs pulse |
| ECHO | D2 (GPIO4) | Via 1kΩ→2kΩ voltage divider |
| GND | GND | Shared ground |

### DS18B20 → ESP8266

| DS18B20 | ESP8266 | Note |
|---------|---------|------|
| VDD | 3.3V | |
| DQ | D4 (GPIO2) | 4.7kΩ pull-up to 3.3V |
| GND | GND | Shared ground |

---

## Provisioning (First Boot)

1. Power on ESP8266 — it boots as SoftAP `FloydFeeder-{chipId}`
2. Connect phone to that WiFi network (no password)
3. Open Floyd app → provisioning screen
4. WebView loads `192.168.4.1` (WiFiManager portal)
5. Select home WiFi, enter password, tap Save
6. ESP reboots → connects to home WiFi → connects to MQTT broker
7. App extracts chipId, calls `POST /api/devices/claim`
8. Dashboard shows live sensor data

---

## MQTT Topics

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `floyd/devices/{chipId}/telemetry` | ESP → Cloud | Sensor data |
| `floyd/devices/{chipId}/status` | ESP → Cloud | Connection state (retained) |
| `floyd/devices/{chipId}/command` | Cloud → ESP | Feed/stop/jam/ping commands |
| `floyd/devices/{chipId}/response` | ESP → Cloud | Command acknowledgments |
| `floyd/devices/{chipId}/config` | Cloud → ESP | Container geometry updates |

---

## Troubleshooting

### ESP won't boot
- D8 (GPIO15) must be LOW — check L298N IN3 connection
- D3 (GPIO0) must be HIGH — check for pull-ups
- D4 (GPIO2) pulled LOW? 4.7kΩ pull-up to 3.3V required

### Motors don't move
- ENA/ENB jumper caps removed? (required for PWM)
- Shared ground connected? (L298N GND ≡ ESP GND ≡ PSU GND)
- L298N 5V enable jumper in place?

### HC-SR04 reads 0 or max
- VCC connected to 5V (not 3.3V)?
- ECHO voltage divider wired correctly?
- Sensor facing downward with clear acoustic cone?

### DS18B20 reads 85°C
- OneWire v2.3.5 bug — downgrade to v2.3.0
- Or add `delay(1000)` after `requestTemperatures()`

### MQTT won't connect
- Check Serial Monitor for broker URL
- Public broker: `broker.hivemq.com:1883` (plain TCP)
- TLS cluster: `setInsecure()` and port 8883
