# Timer Feature — Feed Duration Control

Adds user-configurable feed duration to the manual feed controls.

---

## Architecture

The app sends a `feedMs` parameter with the `start_feed` MQTT command. The ESP8266 firmware runs the auger for the specified duration as part of its motor state machine.

```
User sets duration (1-30s) in Controls tab
        │
        ▼
Controls tab publishes MQTT command:
  {"action":"start_feed","feedMs":5000,"augerSpeed":768,...}
        │
        ▼
ESP8266 receives command → enters PRE_SPIN → FEEDING (5s) → POST_SPIN → IDLE
```

---

## Implementation

### App (`app/(tabs)/controls.tsx`)

- Add `feedDuration` slider (1–30s) to the Feed Dispenser card
- The FEED button sends `feedMs: duration * 1000` in the MQTT command

### Context (`hooks/useESP8266Context.tsx`)

- `startFeed()` accepts `durationMs` parameter, passes it through in the `start_feed` command payload

### Firmware (`ESP8266_MQTT_Server.ino`)

- Motor state machine already handles `feedMs` from `start_feed` command — no changes needed
- States: PRE_SPIN (impeller clears outlet) → FEEDING (auger runs for `feedMs`) → POST_SPIN (impeller clears remaining food)

---

## Status

**Complete.** The firmware already parses `feedMs` from the command JSON. The app already passes it. Only UI slider integration needed.
