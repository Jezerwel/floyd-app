# Floyd Fish Feeder v2 — Hardware Setup Guide

> **Note:** This guide describes the original hardware design. The project now uses ESP32. HC-SR04 and DS18B20 sensors are not currently connected.

---

## What This Device Does

An automatic fish feeder you control from your phone. It has:

1. **Auger Motor** — turns a screw to push food pellets out
2. **Impeller Motor** — spins a fan to blow the food across the water
3. **Ultrasonic Sensor** — measures how much food is left in the container
4. **Temperature Sensor** — monitors water temperature

**Feeding sequence:**

```
1. Impeller spins up (1-2 seconds)       → gets airflow ready
2. Auger turns + Impeller keeps spinning → dispenses food
3. Auger stops                           → done pushing food
4. Impeller keeps spinning (1-2 seconds) → clears remaining food from chute
5. Impeller stops                        → all done
```

**Extra features:**

- **Clear Jam button** — runs auger in reverse to unclog
- **Scheduled feeding** — set times (e.g., 8am, 6pm) and it feeds automatically
- **Alerts** — warns you when food is low or temperature is wrong

---

## Parts List

### Core Electronics

| Part                          | Quantity | Notes                                        |
| ----------------------------- | -------- | -------------------------------------------- |
| ESP32 (NodeMCU or Wemos D1) | 1        | The brain. Needs WiFi.                       |
| L298N Motor Driver            | 1        | Drives both motors. Can handle 2A per motor. |
| DC Auger Motor                | 1        | Low speed, high torque. The food pusher.     |
| DC Impeller Motor             | 1        | Spins a fan/blower. The food spreader.       |
| HC-SR04 Ultrasonic Sensor     | 1        | Measures food level in container.            |
| DS18B20 Temperature Sensor    | 1        | Waterproof. Goes in the water.               |
| 4.7kΩ Resistor                | 1        | Pull-up for DS18B20 data line.               |
| 12V Power Supply              | 1        | Powers the L298N motor driver.               |
| 5V Power Supply (or USB)      | 1        | Powers the ESP32.                          |

### Optional / Nice to Have

| Part                      | Why                                |
| ------------------------- | ---------------------------------- |
| Capacitor 100µF           | Smooths power to ultrasonic sensor |
| Breadboard + jumper wires | For prototyping                    |
| Perfboard / PCB           | For permanent build                |
| Terminal blocks           | Clean motor wire connections       |

---

## Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          L298N MOTOR DRIVER                         │
│                                                                     │
│  +12V ──── 12V pin                                                  │
│  GND  ──── GND pin (shared with ESP32)                            │
│  +5V  ──── 5V pin  (can power ESP32 if 5V regulator enabled)     │
│                                                                     │
│  ┌──── Motor A (Auger) ────┐    ┌──── Motor B (Impeller) ────┐     │
│  │                         │    │                             │     │
│  │  OUT1 ──── Auger +      │    │  OUT3 ──── Impeller +       │     │
│  │  OUT2 ──── Auger -      │    │  OUT4 ──── Impeller -       │     │
│  └─────────────────────────┘    └─────────────────────────────┘     │
│                                                                     │
│  Control pins (to ESP32):                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                │
│  │  ENA (PWM speed)    │    │  ENB (PWM speed)    │                │
│  │  IN1 (direction)    │    │  IN3 (direction)    │                │
│  │  IN2 (direction)    │    │  IN4 (direction)    │                │
│  └─────────────────────┘    └─────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          ESP32 (NodeMCU)                          │
│                                                                     │
│         ┌───────────────────────────────────────────┐              │
│         │              USB (power/program)           │              │
│         └───────────────────────────────────────────┘              │
│                                                                     │
│  GPIO16 ──── L298N IN4    (Impeller Direction 2)              │
│  GPIO5  ──── HC-SR04 TRIG                                   │
│  GPIO4  ──── HC-SR04 ECHO                                   │
│  GPIO0  ──── L298N ENB    (Impeller PWM Speed)               │
│  GPIO2  ──── DS18B20 DATA (with 4.7kΩ to 3.3V)              │
│  GPIO14 ──── L298N ENA    (Auger PWM Speed)                  │
│  GPIO12 ──── L298N IN1    (Auger Direction 1)                │
│  GPIO13 ──── L298N IN2    (Auger Direction 2)                │
│  GPIO15 ──── L298N IN3    (Impeller Direction 1)              │
│                                                                     │
│  3.3V ──── DS18B20 VCC                                              │
│  3.3V ──── 4.7kΩ resistor → GPIO2                                      │
│  GND  ──── DS18B20 GND                                              │
│  GND  ──── HC-SR04 GND                                              │
│  GND  ──── L298N GND                                                │
│  VU (5V) ─── HC-SR04 VCC                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      HC-SR04 ULTRASONIC SENSOR                      │
│                                                                     │
│  VCC  ──── ESP32 VU (5V)                                         │
│  TRIG ──── ESP32 GPIO5                                      │
│  ECHO ──── ESP32 GPIO4                                      │
│  GND  ──── ESP32 GND                                              │
│                                                                     │
│  Mount facing DOWN into the food container.                         │
│  Measures: distance to food surface → calculates fill percentage.   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      DS18B20 TEMPERATURE SENSOR                     │
│                                                                     │
│  Red   (VCC)  ──── ESP32 3.3V                                     │
│  Black (GND)  ──── ESP32 GND                                      │
│  Yellow (DATA) ─── ESP32 GPIO2                               │
│                                                                     │
│  4.7kΩ resistor between VCC (3.3V) and DATA (GPIO2).                  │
│                                                                     │
│  Submerge the metal end in the water. Seal the wires.               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pin Summary Table

| ESP32 Pin | GPIO   | Connected To | Purpose                 |
| ----------- | ------ | ------------ | ----------------------- |
| GPIO16          | GPIO16 | L298N IN4    | Impeller direction 2    |
| GPIO5          | GPIO5  | HC-SR04 TRIG | Ultrasonic trigger      |
| GPIO4          | GPIO4  | HC-SR04 ECHO | Ultrasonic echo         |
| GPIO0          | GPIO0  | L298N ENB    | Impeller PWM speed      |
| GPIO2          | GPIO2  | DS18B20 DATA | Temperature sensor data |
| GPIO14          | GPIO14 | L298N ENA    | Auger PWM speed         |
| GPIO12          | GPIO12 | L298N IN1    | Auger direction 1       |
| GPIO13          | GPIO13 | L298N IN2    | Auger direction 2       |
| GPIO15          | GPIO15 | L298N IN3    | Impeller direction 1    |

---

## Power Notes

```
┌──────────────┐     12V     ┌──────────────┐
│  12V Supply  │─────────────│    L298N     │
│  (2A+ recommended)         │  12V input   │
└──────────────┘             │              │
                             │  5V output ────┐
                             └──────────────┘ │
                                               │ 5V (if using L298N's
                             ┌──────────────┐ │ onboard regulator)
                             │   ESP32    │ │
                             │   VIN pin  ──┘
                             │   or USB port
                             └──────────────┘

Alternative: Power ESP32 separately via USB, L298N via 12V.
Just make sure ALL GNDs are connected together.
```

**Important:** Connect all GND pins together — ESP32 GND, L298N GND, sensor GNDs. This is the reference for all signals.

---

## Motor Connections

### Auger Motor (Food Dispenser)

```
L298N OUT1  ────  Auger Motor + (red)
L298N OUT2  ────  Auger Motor - (black)
```

- Forward = pushes food out
- Reverse = clears jams
- Runs at ~75% speed for high torque (adjustable in app)

### Impeller Motor (Food Spreader / Blower)

```
L298N OUT3  ────  Impeller Motor + (red)
L298N OUT4  ────  Impeller Motor - (black)
```

- Forward only = blows food across water
- Runs at ~100% speed for max spread (adjustable in app)

---

## Sensor Mounting

### Ultrasonic Sensor Position

```
┌─────────────────────────┐
│     Food Container      │
│     (Two-Part Shape)    │
│                         │
│   ┌───────────────┐     │ ← Sensor mount
│   │  Ultrasonic   │     │
│   │  HC-SR04      │     │
│   │  (faces down) │     │
│   └───────┬───────┘     │
│           │ d = 0"      │
│           │             │
│   ╔═══════╤═══════╗     │ ← CYLINDER section (uniform width)
│   ║       │       ║     │   Height = 10 inches
│   ║       │       ║     │
│   ║       │       ║     │
│   ╚═══════╧═══════╝     │ ← 10" mark (cylinder → frustum transition)
│    ╲             ╱      │
│     ╲  FRUSTUM  ╱       │ ← FUNNEL/CONE section (narrows down)
│      ╲         ╱        │   Height = ~6 inches
│       ╲       ╱         │
│        └───────┘         │ ← Bottom of container
│                         │
└─────────────────────────┘
```

### How Food Level is Calculated

The container has **two sections** and the formula switches at the 10-inch mark:

```
         Sensor
           │
    ┌──────┴──────┐
    │  CYLINDER   │ ← uniform width, 10" tall
    │             │
    └──────┬──────┘ ← 10" from sensor
          ╱ ╲
         ╱   ╲
        ╱FRUSTUM╲ ← funnel shape, narrows toward bottom
       ╱         ╲
      └───────────┘
```

| Distance (d) | What's happening                                      | Formula                                            |
| ------------ | ----------------------------------------------------- | -------------------------------------------------- |
| d ≤ 10"      | Food is high — fills part of cylinder + whole frustum | **Vcurrent = Vcylinder(partial) + Vfrustum(full)** |
| d > 10"      | Food is low — only in the frustum section             | **Vcurrent = Vfrustum(partial)**                   |

**What the app displays:**

```
Food Level % = (Current Volume / Total Volume) × 100%
```

Where:

- **Total Volume** = volume of entire cylinder + entire frustum (computed once from dimensions)
- **Current Volume** = volume of food currently in container (from the formula above)

### Container Dimensions You Need to Measure

These values go into the firmware (easily changed — no re-wiring needed):

| Measurement           | Description                                | Example       |
| --------------------- | ------------------------------------------ | ------------- |
| Cylinder Radius       | Radius of the straight-walled top section  | 10 cm         |
| Cylinder Height       | Height from sensor to where funnel starts  | 25.4 cm (10") |
| Frustum Top Radius    | Radius at top of funnel (same as cylinder) | 10 cm         |
| Frustum Bottom Radius | Radius at narrow bottom of funnel          | 5 cm          |
| Frustum Height        | Height of the funnel section               | 15 cm         |

> **Note for the software person:** These 5 numbers go into the firmware code as `#define` constants. If the physical container dimensions change, update these numbers, re-flash, and the percentage will recalculate automatically. No need to change wires or sensors.

### Temperature Sensor Position

Submerge the DS18B20 metal probe in the fish tank water. Keep the wire connections above water (seal with heatshrink or silicone).

---

## How the Feeding Works (Flow)

```
Press "FEED" button in app
         │
         ▼
┌─────────────────────┐
│ 1. PRE-SPIN (1.5s)  │  Impeller starts blowing
│    Auger: OFF       │  Gets airflow established
│    Impeller: ON     │
└────────┬────────────┘
         │ after 1.5s
         ▼
┌─────────────────────┐
│ 2. FEEDING (3s)     │  Both motors running
│    Auger: ON        │  Auger pushes food into airstream
│    Impeller: ON     │  Impeller blows it across water
└────────┬────────────┘
         │ after 3s
         ▼
┌─────────────────────┐
│ 3. POST-SPIN (1.5s) │  Auger stops
│    Auger: OFF       │  Impeller keeps blowing to clear
│    Impeller: ON     │  remaining food from the chute
└────────┬────────────┘
         │ after 1.5s
         ▼
┌─────────────────────┐
│ 4. IDLE             │  Both motors off
│    Auger: OFF       │  Ready for next feed
│    Impeller: OFF    │
└─────────────────────┘

All timing values are adjustable in the app.
```

---

## Clear Jam (Reverse)

```
Press "CLEAR JAM" in app
         │
         ▼
┌─────────────────────┐
│ Auger runs BACKWARDS│  Impeller stays off
│ for 2 seconds       │  Reverses the screw to unclog
└────────┬────────────┘
         │ after 2s
         ▼
        IDLE
```

---

## What Your Friend Needs to Do (The Software Person)

After you wire everything up, the software person needs to:

1. **Flash the ESP32** with new firmware (provided)
2. **Set the WiFi name and password** in the firmware
3. **Deploy the cloud server** (it's already set up on Railway)
4. **Test the app** — verify sensors read correctly, motors spin in the right direction

**They will need to know:**

- Your WiFi network name and password
- The physical feeder height (distance from sensor to bottom of container)
- Full distance and empty distance readings (they'll help calibrate)

The dimensional values (height, min, max) are easy to change — just a few lines in the firmware code. No need to re-wire anything.

---

## Quick Reference Card

```
POWER ON → ESP32 connects to WiFi → starts WebSocket server
         → Sensors start reading every 5 seconds
         → App connects via cloud server
         → App shows:
              • Food level (%)
              • Water temperature (°C)
              • Motor status
              • WiFi signal strength
              • Alerts (low food, bad temp, sensor disconnected)
```

---

## Troubleshooting

| Problem                        | Check                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| Motors don't spin              | 12V power to L298N? GND connected to ESP32?              |
| Ultrasonic reads wrong         | Sensor facing down? Nothing blocking the beam cone?        |
| Temperature reads -127°C       | DS18B20 disconnected or bad wiring. Check 4.7kΩ resistor.  |
| ESP32 won't connect to WiFi  | Wrong SSID/password in firmware? Too far from router?      |
| App can't connect nect to WiFi | Wrong SSID/password in firmware? Too far from router?      |
| App can't connect              | Cloud server down? ESP32 not on same WiFi as configured? |
