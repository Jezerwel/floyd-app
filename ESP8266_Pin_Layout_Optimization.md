# ESP8266 Pin Layout — L298N Motor Driver Configuration

Optimized pin assignment for the Floyd Feeder v2 hardware (L298N H-bridge + HC-SR04 + DS18B20).

---

## Pin Assignment

| ESP8266 | GPIO | Connected To | Function |
|---------|------|-------------|----------|
| D0 | GPIO16 | L298N IN4 | Impeller Direction 4 |
| D1 | GPIO5 | HC-SR04 TRIG | Ultrasonic trigger (10µs pulse) |
| D2 | GPIO4 | HC-SR04 ECHO | Ultrasonic echo via voltage divider (1kΩ+2kΩ) |
| D3 | GPIO0 | L298N ENB | Impeller PWM speed |
| D4 | GPIO2 | DS18B20 DQ | OneWire temperature (4.7kΩ pull-up to 3.3V) |
| D5 | GPIO14 | L298N ENA | Auger PWM speed |
| D6 | GPIO12 | L298N IN1 | Auger Direction 1 |
| D7 | GPIO13 | L298N IN2 | Auger Direction 2 |
| D8 | GPIO15 | L298N IN3 | Impeller Direction 3 |

---

## Boot Safety Analysis

| Pin | Risk | Mitigation |
|-----|------|------------|
| D3 (GPIO0) | Flash button — must be HIGH on boot | External pull-up; L298N ENB is input-only |
| D8 (GPIO15) | Must be LOW on boot | L298N IN3 output LOW in `setup()` |
| D4 (GPIO2) | Built-in pull-up; boot fail if LOW | 4.7kΩ pull-up to 3.3V ensures HIGH |
| D0 (GPIO16) | RST connection can cause reset loops | Configured as output, initialized LOW |

---

## L298N Configuration

- **ENA/ENB jumper caps: REMOVED** — enables PWM speed control from D5/D3
- **5V enable jumper:** LEFT IN PLACE (onboard 78M05 regulator powers L298N logic from 12V rail)

---

## Wiring Overview

### L298N → ESP8266

| L298N | ESP8266 | Wire Color |
|-------|---------|------------|
| ENA | D5 (GPIO14) | Orange |
| IN1 | D6 (GPIO12) | Yellow |
| IN2 | D7 (GPIO13) | Green |
| ENB | D3 (GPIO0) | Blue |
| IN3 | D8 (GPIO15) | Purple |
| IN4 | D0 (GPIO16) | Gray |

### HC-SR04 → ESP8266

| HC-SR04 | ESP8266 | Note |
|---------|---------|------|
| VCC | 5V (VU) | 5V required — unreliable at 3.3V |
| TRIG | D1 (GPIO5) | 3.3V logic OK on TRIG |
| ECHO | D2 (GPIO4) | **Voltage divider required** (1kΩ+2kΩ → ~3.3V) |
| GND | GND | Shared ground |

### DS18B20 → ESP8266

| DS18B04 | ESP8266 | Note |
|---------|---------|------|
| VDD | 3.3V | |
| DQ | D4 (GPIO2) | 4.7kΩ pull-up to 3.3V mandatory |
| GND | GND | Shared ground |

---

## Benefits

- **No pin conflicts** — all sensors and motors operate simultaneously
- **No shared resource logic** — no complex pin-sharing code
- **Reliable boot** — GPIO0 (D3) and GPIO15 (D8) handled correctly
- **PWM speed control** — ENA/ENB jumpers removed for ESP8266 PWM control
