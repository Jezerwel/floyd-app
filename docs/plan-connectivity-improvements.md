# Plan: Connectivity Improvements for Low-Signal Areas [✅ IMPLEMENTED]

**Context:** Floyd Feeder (ESP32 + React Native app) deployed where internet signal is weak.
**Goal:** Maximize reliable communication range between the phone and ESP32 without changing the dual-transport (BLE + SoftAP/MQTT) architecture.
**Hardware:** ESP32 SuperMini S3 (supports BLE 5.0 Coded PHY).

---

## Change 1 — BLE Max TX Power

**File:** `ESP32_MQTT_Server.ino`
**Location:** `initBleStack()` function, after `NimBLEDevice::init()` — line 1037

**What:**

```cpp
// Current (implicit default ~+3 dBm)
NimBLEDevice::init(deviceName.c_str());

// After change
NimBLEDevice::init(deviceName.c_str());
NimBLEDevice::setPower(ESP_PWR_LVL_P9);  // +9 dBm maximum
```

**Why:** The ESP32's radio defaults to a conservative power level. Bumping to +9 dBm roughly **doubles effective BLE range** (~6 dB gain). This is a one-liner, zero-risk change.

**Verification:** Flash firmware, connect the app via BLE, compare RSSI values before/after at the same distance.

---

## Change 2 — SoftAP MQTT Idle Timeout (60s → 300s)

**File:** `ESP32_MQTT_Server.ino`
**Location:** `loop()` function — line 1141

**What:**

```cpp
// Current
if (elapsedSince(lastMqttRx) > 60000UL) {

// After change
if (elapsedSince(lastMqttRx) > 300000UL) {
```

**Why:** In low-signal areas, users move slower and connection setup takes longer. A 60-second idle timeout is too aggressive — it kicks users back to BLE mode before they've finished interacting. 5 minutes gives a comfortable buffer while still recovering if the phone leaves the area.

**Verification:** Trigger SoftAP mode, wait 2 minutes without sending a command — device should stay in AP mode.

---

## Change 3 — Detect ESP32 Variant & Enable BLE 5.0 Coded PHY

**Status:** ⚠️ **Hardware-dependent — only if ESP32-S3/C3/H2 is used.**

**File:** `ESP32_MQTT_Server.ino`
**Location:** `initBleStack()` function — advertising setup section (around line 1078)

**What (conceptual):**

```cpp
#if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C3)
  NimBLEAdvertisementData advData;
  advData.setPrimaryPHY(BLE_HCI_LE_PHY_CODED);
  advData.setSecondaryPHY(BLE_HCI_LE_PHY_CODED);
  pAdvertising->setAdvertisementData(advData);
#endif
```

**Why:** BLE 5.0 Coded PHY uses forward error correction to achieve ~4× range over standard BLE 1M PHY. Only works on ESP32-S3, C3, or H2 chips.

**Status:** ✅ Implemented (2026-05-06).
**User action required:** To enable Coded PHY, uncomment `#define CONFIG_BT_NIMBLE_EXT_ADV 1` in `<Arduino>/libraries/NimBLE-Arduino/src/nimconfig.h` before flashing.

**Verification:** Check the Serial monitor for the chip model on boot (`ESP.getChipModel()`). If it's an S3/C3, this change applies.

---

## Change 4 — Phone-Side: BLE Connection Resilience

**File:** `hooks/useBLETransport.ts`
**Location:** `connect()` function — around line 68

**What:** Add retry logic for BLE connections that fail on the first attempt.

```typescript
// Current: single connection attempt
dev = await mgr.connectToDevice(deviceId, { timeout: 10000 });

// After change: retry once on failure
const MAX_RETRIES = 2;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    dev = await mgr.connectToDevice(deviceId, { timeout: 10000 });
    break; // success
  } catch (e) {
    if (attempt === MAX_RETRIES) throw e;
    await new Promise((r) => setTimeout(r, 1000)); // wait 1s before retry
  }
}
```

**Why:** In low-signal areas, the first BLE connection attempt is more likely to fail due to interference or weak signal. A simple retry with 1s delay dramatically improves success rate without changing the UX.

**Verification:** Walk to the edge of BLE range, try connecting — should succeed on retry where it previously failed.

---

## Summary

| #   | Change                 | Effort   | Impact                | Risk | Blocked By        |
| --- | ---------------------- | -------- | --------------------- | ---- | ----------------- |
| 1   | BLE TX power +9 dBm    | ~1 line  | High (~2× range)      | None | ESP32 flash       |
| 2   | SoftAP timeout 60→300s | ~1 line  | Medium (better UX)    | None | ESP32 flash       |
| 3   | BLE 5.0 Coded PHY      | ~5 lines | Very High (~4× range) | Low  | ESP32-S3 hardware |
| 4   | BLE retry on phone     | ~8 lines | Medium (fewer fails)  | None | App rebuild       |

**Files modified:**

- `ESP32_MQTT_Server.ino` — changes 1, 2, 3
- `hooks/useBLETransport.ts` — change 4

**No structural changes to the architecture.** All improvements are surgical and independently deployable.
