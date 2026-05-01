# Known Bugs & Issues

Tracked against the current MQTT-based architecture (ESP8266 + L298N + cloud server).

---

## ESP8266 Firmware

### 1. OneWire v2.3.5 — 85°C Stuck Reading

- **Issue:** OneWire library v2.3.5+ has a confirmed ESP8266 bug — temperature readings return a stuck value of **85°C** (DS18B20 power-on reset value). The library fails to drive the GPIO high during parasitic power conversion.
- **Root cause:** PaulStoffregen/OneWire#58
- **Workaround:** Downgrade to OneWire v2.3.0, or add `delay(1000)` after `sensor.requestTemperatures()`.
- **Severity:** HIGH

### 2. TLS Heap Exhaustion on ESP8266

- **Issue:** TLS handshake with HiveMQ Cloud consumes 40–50KB of free heap (~80KB total on ESP8266). Community reports of OOM crashes, handshake timeouts, and connection drops after large messages.
- **Root cause:** Espressif issue #6618, PubSubClient issue #462
- **Workaround:** Use `setInsecure()` (skip cert validation). Fall back to public `broker.hivemq.com:1883` (plain TCP) if unstable.
- **Severity:** MEDIUM

### 3. `pulseIn` No Timeout

- **Issue:** `readUltrasonicDistance()` uses `pulseIn` without a timeout. A faulty sensor can cause indefinite blocking.
- **Todo:** Add `pulseIn(ECHO_PIN, HIGH, 23529)` timeout (~400cm max range).
- **Severity:** LOW

### 4. Single Ultrasonic Reading

- **Issue:** Distance is read once per cycle. No averaging, susceptible to noise.
- **Todo:** Take 3–5 readings and average them.
- **Severity:** LOW

---

## Mobile App

### 1. MQTT CR_LF Injection in Topic Filters

- **Issue:** `useMQTT.ts` uses hardcoded topic strings. Device chipId containing special characters could cause topic injection.
- **Mitigation:** ChipId is `ESP.getChipId()` hex — alphanumeric only. Not exploitable in practice.
- **Severity:** LOW

### 2. No Reconnection Backoff

- **Issue:** MQTT reconnection retries immediately on disconnect, potentially causing rapid reconnect loops.
- **Todo:** Implement exponential backoff (1s, 2s, 4s, ... max 30s).
- **Severity:** LOW

### 3. Schedule Tab — No Loading State

- **Issue:** `schedule.tsx` fetches schedules from the server but doesn't show a loading indicator during the fetch. On slow connections the list appears empty momentarily.
- **Todo:** Add Skeleton loading state.
- **Severity:** LOW

---

## Server

### 1. Schedule Cron — No Daylight Saving Handling

- **Issue:** `scheduler.ts` uses `node-cron` with fixed UTC times. Schedules won't adjust for DST shifts.
- **Severity:** LOW (acceptable for most use cases)

### 2. SQLite Concurrent Writes

- **Issue:** SQLite (via Prisma) handles concurrent writes with a file lock. Under multiple simultaneous schedule writes, some may fail.
- **Mitigation:** Prisma retries on lock. Acceptable at single-user scale.
- **Severity:** LOW

---

## Resolved Issues

| Issue | Status | Fixed In |
|-------|--------|----------|
| Hardcoded WiFi credentials | ✅ WiFiManager provisioning | v2.0 |
| No WiFi reconnection logic | ✅ WiFiManager + PubSubClient auto-reconnect | v2.0 |
| Stepper motor control via relay | ✅ Replaced with L298N H-bridge + DC motors | v2.0 |
| WebSocket proxy architecture | ✅ Migrated to direct MQTT | v2.0 |
| No connection status indicator | ✅ Connection badges in dashboard | v2.0 |
| Hardcoded ESP IP address | ✅ MQTT broker discovery, no IP needed | v2.0 |
