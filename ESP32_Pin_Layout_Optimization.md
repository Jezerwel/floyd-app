# ESP32 Pin Layout — L298N Motor Driver Configuration

Optimized pin assignment for the Floyd Feeder v2 hardware (L298N H-bridge + HC-SR04 + DS18B20).

---

## Pin Assignment

| ESP32 | GPIO | Connected To | Function |
|-------|------|-------------|----------|
| GPIO16 | GPIO16 | L298N IN4 | Impeller Direction 4 |
| GPIO5 | GPIO5 | HC-SR04 TRIG | Ultrasonic trigger (10µs pulse) |
| GPIO4 | GPIO4 | HC-SR04 ECHO | Ultrasonic echo via voltage divider (1kΩ+2kΩ) |
| GPIO0 | GPIO0 | L298N ENB | Impeller PWM speed |
| GPIO2 | GPIO2 | DS18B20 DQ | OneWire temperature (4.7kΩ pull-up to 3.3V) |
| GPIO14 | GPIO14 | L298N ENA | Auger PWM speed |
| GPIO12 | GPIO12 | L298N IN1 | Auger Direction 1 |
| GPIO13 | GPIO13 | L298N IN2 | Auger Direction 2 |
| GPIO15 | GPIO15 | L298N IN3 | Impeller Direction 3 |

---

## Boot Safety Analysis

| Pin | Risk | Mitigation |
|-----|------|------------|
| GPIO0 (GPIO0) | Flash button — must be HIGH on boot | External pull-up; L298N ENB is input-only |
| GPIO15 (GPIO15) | Must be LOW on boot | L298N IN3 output LOW in `setup()` |
| GPIO2 (GPIO2) | Built-in pull-up; boot fail if LOW | 4.7kΩ pull-up to 3.3V ensures HIGH |
| GPIO16 (GPIO16) | RST connection can cause reset loops | Configured as output, initialized LOW |

---

## L298N Configuration

- **ENA/ENB jumper caps: REMOVED** — enables PWM speed control from GPIO14/GPIO0
- **5V enable jumper:** LEFT IN PLACE (onboard 78M05 regulator powers L298N logic from 12V rail)

---

## Wiring Overview

### L298N → ESP32

| L298N | ESP32 | Wire Color |
|-------|-------|------------|
| ENA | GPIO14 (GPIO14) | Orange |
| IN1 | GPIO12 (GPIO12) | Yellow |
| IN2 | GPIO13 (GPIO13) | Green |
| ENB | GPIO0 (GPIO0) | Blue |
| IN3 | GPIO15 (GPIO15) | Purple |
| IN4 | GPIO16 (GPIO16) | Gray |

### HC-SR04 → ESP32

| HC-SR04 | ESP32 | Note |
|---------|-------|------|
| VCC | 5V (VU) | 5V required — unreliable at 3.3V |
| TRIG | GPIO5 (GPIO5) | 3.3V logic OK on TRIG |
| ECHO | GPIO4 (GPIO4) | **Voltage divider required** (1kΩ+2kΩ → ~3.3V) |
| GND | GND | Shared ground |

**NOTE:** HC-SR04 ultrasonic sensor is not currently connected

### DS18B20 → ESP32

| DS18B04 | ESP32 | Note |
|---------|-------|------|
| VDD | 3.3V | |
| DQ | GPIO2 (GPIO2) | 4.7kΩ pull-up to 3.3V mandatory |
| GND | GND | Shared ground |

**NOTE:** DS18B20 temperature sensor is not currently connected

---

## Benefits

- **No pin conflicts** — all sensors and motors operate simultaneously
- **No shared resource logic** — no complex pin-sharing code
- **Reliable boot** — GPIO0 (GPIO0) and GPIO15 (GPIO15) handled correctly
- **PWM speed control** — ENA/ENB jumpers removed for ESP32 PWM control
