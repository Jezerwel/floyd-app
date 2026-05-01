# Floyd Fish Feeder — Electronics Setup Guide

**Version 2.0 · 2026.05 · Refined with community best practices**

This document extracts all electronics content from the full manual setup guide, adds community refinements and gotchas gathered from hardware forums, GitHub issues, and field reports. Written for the electronics person building the feeder.

---

## Contents

1. [Components List](#01-components-list)
2. [Firmware & Libraries](#02-firmware--libraries)
3. [Motor & Sensor Wiring](#03-motor--sensor-wiring)
4. [Power & Enclosure](#04-power--enclosure)
5. [First-Boot Provisioning](#05-first-boot-provisioning)
6. [Common Pitfalls & Refinements](#06-common-pitfalls--refinements)
7. [Pin Reference & Wiring Schematic](#07-pin-reference--wiring-schematic)

---

## 01 Components List

| # | Component | Qty | Notes |
|---|---|---|---|
| 1 | ESP8266 NodeMCU (ESP-12E, Wemos D1 Mini, etc.) | 1 | ~80mA idle, ~300mA WiFi TX |
| 2 | L298N Dual H-Bridge Motor Driver | 1 | Has onboard 5V regulator (jumper-controlled) |
| 3 | HC-SR04 Ultrasonic Distance Sensor | 1 | **5V only** — will not work reliably at 3.3V |
| 4 | DS18B20 Temperature Sensor | 1 | TO-92 package, 3.3V or 5V |
| 5 | DC Motor — Auger (food delivery screw) | 1 | 12V, 200–800mA under load |
| 6 | DC Motor — Impeller (food scattering) | 1 | 12V, 200–800mA under load |
| 7 | 12V DC Power Supply (2A+) | 1 | For L298N and motors |
| 8 | 5V USB Power Adapter (1A+) | 1 | For ESP8266 (separate from motor supply) |
| 9 | Resistor 1kΩ | 1 | HC-SR04 ECHO voltage divider |
| 10 | Resistor 2kΩ | 1 | HC-SR04 ECHO voltage divider |
| 11 | Resistor 4.7kΩ | 1 | DS18B20 pull-up (CRITICAL) |
| 12 | Capacitor 100µF electrolytic | 1 | L298N 12V input decoupling |
| 13 | Capacitor 0.1µF ceramic | 2 | Across each motor terminal (snubber) |
| 14 | Jumper wires (M-F, M-M) | ~20 | Various colors recommended |

---

## 02 Firmware & Libraries

The sketch (`ESP8266_MQTT_Server.ino`) is fully written. It is **MQTT-based** using `PubSubClient` for MQTT and `WiFiManager` for SoftAP provisioning.

### 2.1 Arduino Libraries to Install

Open Arduino IDE: *Tools → Manage Libraries*, search and install:

| Library | Purpose | Version |
|---|---|---|
| **PubSubClient** | MQTT client for ESP8266 with keepalive, LWT, and QoS support. | v2.6+ |
| **WiFiManager** (by tzapu) | Captive portal provisioning — ESP boots as AP, user enters WiFi creds via phone. | v2.0.17+ |
| **ArduinoJson** (by Benoit Blanchon) | JSON parsing for MQTT command/response messages. | v7.x |
| **OneWire** | OneWire protocol for DS18B20. **See known issue below.** | v2.3.0 (NOT 2.3.5+) |
| **DallasTemperature** | High-level DS18B20 interface. | v3.11.1 |
| **ESP8266WiFi** | Built-in with ESP8266 board package. | (board package) |
| **EEPROM** | Built-in. Persistent storage for WiFi creds, MQTT password, sensor geometry. | (board package) |

> **⚠️ OneWire version known issue:** OneWire v2.3.5 has a confirmed bug on ESP8266 — temperature readings return a stuck value of **85°C** (the DS18B20 power-on reset value). The root cause is that the library fails to drive the GPIO pin high during parasitic power conversion. **Downgrade to OneWire v2.3.0** or add a `delay(1000)` after `sensor.requestTemperatures()` as a workaround. See: PaulStoffregen/OneWire#58.

### 2.2 Flashing the Firmware

1. Open `ESP8266_MQTT_Server.ino` in Arduino IDE.
2. *Tools → Board → ESP8266 Boards → NodeMCU 1.0 (ESP-12E Module)* (or your specific board).
3. Select the correct COM port under *Tools → Port*.
4. Baud rate: `115200`. Flash Size: at least `4MB (FS:1MB OTA:~1019KB)`.
5. Press **Upload** (Ctrl+U).
6. Open Serial Monitor at `115200` baud to watch boot sequence.

### 2.3 MQTT Broker Choice — TLS Warning

The ESP8266 defaults to the **public HiveMQ broker** (`broker.hivemq.com`, port 1883, plain TCP) which works perfectly — no TLS overhead.

If you need a **dedicated HiveMQ Cloud cluster** (port 8883, TLS mandatory), be aware:

- TLS handshake on ESP8266 consumes **40–50KB of free heap** on a chip with ~80KB total.
- Community reports describe **frequent OOM crashes, handshake timeouts, and connection drops** after large messages.
- The pragmatic approach is `WiFiClientSecure::setInsecure()` (skip cert validation) since the ESP8266 cannot store the full HiveMQ CA chain.
- **Test TLS stability over 24+ hours** before deploying. If unstable, fall back to the public broker with plain TCP.

Firmware changes for TLS:

```cpp
#include <WiFiClientSecure.h>
WiFiClientSecure secureClient;
BearSSL::WiFiClientSecure wifiClient;

// In configureMQTTClient():
secureClient.setInsecure();
mqttClient.setMqttServer("your-cluster.s1.eu.hivemq.cloud", "floyd-esp", "password", 8883);
```

---

## 03 Motor & Sensor Wiring

### 3.1 L298N Motor Driver — Auger & Impeller

The L298N drives two motors independently. Motor A = auger, Motor B = impeller.

#### Wiring

| L298N Pin | ESP8266 Pin | GPIO | Function | Wire Color |
|---|---|---|---|---|
| ENA | D5 | GPIO14 | Auger PWM speed (0–1023) | Orange |
| IN1 | D6 | GPIO12 | Auger direction 1 | Yellow |
| IN2 | D7 | GPIO13 | Auger direction 2 | Green |
| ENB | D3 | GPIO0 | Impeller PWM speed (0–1023) | Blue |
| IN3 | D8 | GPIO15 | Impeller direction 3 | Purple |
| IN4 | D0 | GPIO16 | Impeller direction 4 | Gray |
| 12V | — | — | External 12V PSU (+) | Red |
| GND | — | — | Shared ground bus | Black |
| OUT1/OUT2 | — | — | Auger motor terminals | — |
| OUT3/OUT4 | — | — | Impeller motor terminals | — |

> **L298N jumper notes:**
> 1. **5V enable jumper** (on L298N): Leave it in place if your motor supply is ≤12V. The onboard 78M05 regulator powers the L298N logic from the 12V rail. If removed, you must supply 5V to the L298N 5V pin separately.
> 2. **ENA/ENB jumper caps**: **Remove them.** By default, these jumpers tie ENA/ENB to 5V (motors at full speed, no PWM control). Removing them lets the ESP8266 control speed via PWM on D5 (ENA) and D3 (ENB).

#### Motor Direction Truth Table

| IN1 | IN2 | Motor A (Auger) |
|---|---|---|
| LOW | LOW | Stop |
| HIGH | LOW | Forward |
| LOW | HIGH | Backward |
| HIGH | HIGH | Stop (brake) |

(IN3/IN4 same logic for Motor B / Impeller.)

### 3.2 HC-SR04 Ultrasonic — Food Level

The HC-SR04 measures distance to the food surface. The firmware converts this to fill percentage using container geometry.

> **⚠️ Critical: The HC-SR04 runs on 5V.** It will not work reliably at 3.3V. Its ECHO pin outputs 5V logic, which **will damage** the ESP8266 GPIO (3.3V max). A voltage divider on ECHO is mandatory.

#### Wiring

| HC-SR04 Pin | ESP8266 Pin | GPIO | Note |
|---|---|---|---|
| VCC | 5V (Vin/VU) | — | **Must be 5V** — 3.3V gives weak/no readings |
| TRIG | D1 | GPIO5 | 10µs pulse. 3.3V is sufficient for logic HIGH on TRIG |
| ECHO | D2 (via divider) | GPIO4 | **5V output — must divide down** |
| GND | GND | — | Shared ground |

#### Voltage Divider (Required on ECHO)

```
HC-SR04 ECHO (5V) ──┬── 1kΩ resistor ──┬── ESP8266 D2 (GPIO4)
                     │                  │
                     │              [2kΩ resistor]
                     │                  │
                    GND ────────────────┴── GND
```

**Alternative resistor pair:** 2.7kΩ + 4.7kΩ also works (gives ~3.25V at GPIO).

The TRIG pin can be driven directly from 3.3V GPIO — it registers HIGH correctly at that voltage.

### 3.3 DS18B20 Temperature Sensor

OneWire protocol on a single GPIO pin. **A 4.7kΩ pull-up resistor is mandatory** between DQ and 3.3V.

#### Wiring

| DS18B20 Pin | ESP8266 Pin | GPIO | Note |
|---|---|---|---|
| VDD | 3.3V | — | Use 3.3V to avoid level conversion |
| DQ (Data) | D4 | GPIO2 | OneWire data line |
| GND | GND | — | Shared ground |

```
DS18B20             ESP8266
┌──────┐
│ VDD  ├────────── 3.3V
│ DQ   ├──┬─────── D4 (GPIO2)
│ GND  ├──┤─────── GND
└──────┘  │
         [4.7kΩ resistor]
           │
         3.3V
```

> **⚠️ GPIO2 boot consideration:** GPIO2 (D4) on ESP8266 has a built-in pull-up and is sampled during boot. If pulled LOW at startup, the ESP may fail to boot. The external 4.7kΩ pull-up to 3.3V mitigates this. If you still encounter boot failures, move the DS18B20 to D3 (GPIO0) or D5 (GPIO14) and update the `ONE_WIRE_BUS` define in firmware.

#### Known Issues

- **85°C reading:** Caused by OneWire v2.3.5 bug. Downgrade to v2.3.0 or add `delay(1000)` after `requestTemperatures()`. See section 2.1.
- **GPIO2 conflict:** If using Serial debug output, note that GPIO2 is also TXD1 on some boards. The OneWire library disables interrupts during timing-critical operations, which can interfere with serial output. Use a different GPIO if you experience corruption.

---

## 04 Power & Enclosure

### 4.1 Power Architecture

Two separate power rails:

| Component | Voltage | Current | Source |
|---|---|---|---|
| ESP8266 NodeMCU | 5V via USB | ~80mA idle, ~300mA TX | USB adapter (5V 1A min) |
| L298N logic | 5V (from onboard regulator) | ~20mA | From 12V rail via 78M05 regulator |
| Motors (auger + impeller) | 12V DC | 0.5–2A total | 12V 2A+ PSU |
| HC-SR04 | 5V | ~15mA | ESP8266 5V pin |
| DS18B20 | 3.3V | ~1mA | ESP8266 3.3V pin |

### 4.2 Critical Grounding Rule

🟢 **All grounds must be common:** L298N GND ≡ ESP8266 GND ≡ HC-SR04 GND ≡ DS18B20 GND ≡ 12V PSU GND.

Without a shared ground, motor PWM control signals will be floating and the motors won't respond.

### 4.3 Noise Suppression

Motors generate voltage spikes that can reset the ESP8266. Add:

- **100µF electrolytic capacitor** across the 12V input to the L298N (between 12V and GND terminals).
- **0.1µF ceramic capacitor** across each motor's terminals (OUT1/OUT2 and OUT3/OUT4) — solder directly to the motor terminals if possible.
- Keep motor power wires **physically separated** from sensor signal wires.
- Twist motor power wires together to reduce radiated noise.

### 4.4 Enclosure Tips

- Mount ESP8266 away from the food hopper to avoid WiFi attenuation from metal/moisture.
- HC-SR04 must face **directly downward** into the container with a **clear acoustic cone** (15° beam angle) — no obstructions.
- DS18B20 should read ambient temperature, not be touching metal that conducts motor heat.
- L298N heatsink: The driver IC gets hot under continuous operation. Ensure ventilation or attach a small heatsink.
- **Outdoor/humidity:** Conformal-coat exposed PCB contacts or use a sealed enclosure with cable glands.

---

## 05 First-Boot Provisioning

This links hardware to cloud. Run once per device.

1. **Power on ESP8266** — first boot detects no saved WiFi creds, enters SoftAP mode. Onboard LED blinks rapidly.
2. **Phone WiFi settings** — look for `FloydFeeder-XXXX` (e.g., `FloydFeeder-A1B2C3`). Connect (no password, open AP).
3. **Floyd app** — should show provisioning screen automatically, or navigate to `/provision`.
4. **WebView loads captive portal** at `http://192.168.4.1` — the WiFiManager config page.
5. **Select your home WiFi**, enter password, tap *Save*.
6. **ESP8266 reboots** — saves credentials + generates random MQTT password to EEPROM.
7. **Connects to home WiFi** (~30s), then auto-connects to HiveMQ MQTT broker.
8. **App extracts chipId** from WebView via injected JS → `postMessage()` to React Native.
9. **App calls `POST /api/devices/claim`** with chipId, name, MQTT password.
10. **Server registers device**, subscribes to telemetry/status/response topics.
11. **App connects to MQTT** — dashboard shows live sensor data within seconds.

### Re-provisioning

To factory reset: (a) send `factory_reset` MQTT command, (b) clear EEPROM by uploading a blank sketch, or (c) hold GPIO0 to ground at power-on (if hardware button is wired).

---

## 06 Common Pitfalls & Refinements

### L298N
| Issue | Fix |
|---|---|
| Motors don't move | Check ENA/ENB jumper caps are **removed** for PWM control |
| Motors run at full speed only | Jumper caps still on ENA/ENB — remove them |
| Motors vibrate but don't spin | Not enough PWM frequency or current; try lower PWM frequency |
| L298N gets hot | Normal — add heatsink; ensure ventilation |
| ESP resets when motors start | Missing decoupling caps across 12V input and motor terminals |

### HC-SR04
| Issue | Fix |
|---|---|
| Always reads 0 or max | Sensor powered from 3.3V? Needs 5V VCC |
| Erratic readings | Loose ground; add 10µF cap across VCC/GND of sensor |
| ESP resets on sensor read | ECHO pin connected directly to GPIO without voltage divider |
| Readings drift | Temperature compensation needed (speed of sound changes ~0.6%/°C) |

### DS18B20
| Issue | Fix |
|---|---|
| Always reads 85°C | OneWire v2.3.5 bug — downgrade to v2.3.0 or add `delay(1000)` |
| No sensors found | Missing 4.7kΩ pull-up resistor |
| ESP fails to boot | DS18B20 on GPIO2 pulling line low; move to different pin |
| Reading is ~10°C too high | Sensor too close to ESP8266 or L298N heat; extend wires |

### MQTT / TLS
| Issue | Fix |
|---|---|
| ESP doesn't connect to broker | Wrong host/port in firmware; check Serial Monitor at 115200 |
| TLS handshake fails | Use `setInsecure()` or provide CA cert via BearSSL; OOM likely |
| Connection drops after hours | OOM from TLS heap usage; fall back to plain TCP (port 1883, public broker) |

---

## 07 Pin Reference & Wiring Schematic

### A. Complete Pin Reference

| ESP8266 Pin | GPIO | Connected To | Purpose |
|---|---|---|---|
| D0 | GPIO16 | L298N IN4 | Impeller Direction 4 |
| D1 | GPIO5 | HC-SR04 TRIG | Ultrasonic trigger pulse |
| D2 | GPIO4 | HC-SR04 ECHO (via 1kΩ+2kΩ divider) | Ultrasonic echo |
| D3 | GPIO0 | L298N ENB | Impeller PWM speed |
| D4 | GPIO2 | DS18B20 DQ (+ 4.7kΩ to 3.3V) | OneWire temperature |
| D5 | GPIO14 | L298N ENA | Auger PWM speed |
| D6 | GPIO12 | L298N IN1 | Auger Direction 1 |
| D7 | GPIO13 | L298N IN2 | Auger Direction 2 |
| D8 | GPIO15 | L298N IN3 | Impeller Direction 3 |
| GND | — | All GNDs | Common ground bus |
| 3.3V | — | DS18B20 VDD | Temperature sensor power |
| 5V (VU) | — | HC-SR04 VCC | Ultrasonic sensor power |

### B. Wiring Schematic

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
(Jumper ENA/ENB caps REMOVED for PWM control)
(5V enable jumper LEFT IN PLACE if ≤12V supply)

ESP8266 NodeMCU           HC-SR04 Ultrasonic
┌──────────────┐          ┌──────────────┐
│ D1 (GPIO5)   ├──────────┤ TRIG         │
│ D2 (GPIO4)   ├──[1kΩ]───┤ ECHO  ───╮  │
│              │   │       │      [2kΩ]  │
│ GND          ├───┴───────┤ GND  ───╯  │
│ 5V (VU)      ├──────────┤ VCC         │
└──────────────┘          └──────────────┘
Voltage divider: ECHO → 1kΩ → D2 → 2kΩ → GND (drops 5V to ~3.3V)

ESP8266 NodeMCU           DS18B20 Temperature
┌──────────────┐          ┌──────────────┐
│ D4 (GPIO2)   ├──────────┤ DQ (Data)    │
│ 3.3V         ├──[4.7kΩ]─┤ DQ (pull-up) │
│ 3.3V         ├──────────┤ VDD          │
│ GND          ├──────────┤ GND          │
└──────────────┘          └──────────────┘

Common Ground Bus: ESP GND ≡ L298N GND ≡ HC-SR04 GND ≡ DS18B20 GND ≡ 12V PSU GND

Noise suppression:
  ┌──── 100µF electrolytic ────┐
  (+)                          (-)
  12V PSU (+) ──────────── L298N 12V terminal
  12V PSU (-) ──────────── GND bus

  0.1µF ceramic across each motor terminal (OUT1/OUT2, OUT3/OUT4)
```

### C. MQTT Topic Reference

```
floyd/devices/{chipId}/telemetry  ← ESP publishes sensor data (QoS 0)
floyd/devices/{chipId}/status     ← ESP publishes connection state, retained (QoS 0)
floyd/devices/{chipId}/command    ← App + Server publish feed/cmd (QoS 0)
floyd/devices/{chipId}/response   ← ESP publishes command results (QoS 0)
floyd/devices/{chipId}/config     ← App publishes geometry changes (QoS 0)
```

### D. Parts Shopping List (Electronics Only)

| Item | Est. Cost | Source |
|---|---|---|
| ESP8266 NodeMCU | $3–5 | Amazon, AliExpress |
| L298N Motor Driver | $3–5 | Amazon, AliExpress |
| HC-SR04 Ultrasonic | $1–2 | Amazon, AliExpress |
| DS18B20 (TO-92) | $1–2 | Amazon, AliExpress |
| 12V 2A PSU | $5–10 | Amazon, any electronics store |
| 5V USB adapter + cable | $3–5 | Any phone charger |
| Resistor kit (1k, 2k, 4.7k) | $5–8 | Amazon |
| Capacitor kit (100µF, 0.1µF) | $5–8 | Amazon |
| Jumper wires + breadboard | $5–10 | Amazon |
| **Total approx.** | **$30–55** | — |

---

> **Refined for the electronics builder.** Community-sourced fixes for OneWire 85°C bug, L298N jumper removal for PWM, mandatory HC-SR04 voltage divider, ESP8266 TLS caveats, and noise suppression best practices are all incorporated.
