---
title: BLE-Only Connection UX v4
type: feat
status: active
date: 2026-05-06
origin: docs/plans/2026-05-06-ble-primary-wifi-fallback.md
---

# BLE-Only Connection UX v4

## Overview

Remove the Wi‑Fi/MQTT SoftAP fallback entirely and redesign the BLE connection flow with explicit state management, guided onboarding, visual signal strength, tiered timeouts, graceful disconnect handling, and animated transitions. The current codebase carries ~200 lines of dual-transport connection UI, a 3-phase state machine (`feederLinkPhase`), and a full MQTT client — all for a fallback that requires the user to leave the app, manually switch Wi‑Fi networks, and return. This plan drops that complexity and makes BLE the sole transport with a polished, resilient UX.

---

## Problem Frame

**Current state (v3, `2026-05-06-ble-primary-wifi-fallback.md`):** BLE is primary but the code still supports a SoftAP→MQTT fallback. The connection UI uses a `FeederLinkPhase` state machine (`ble` → `wifi_instructions` → `wifi_mqtt`) that renders different cards for each phase. The Wi‑Fi fallback flow tells the user to open system Settings, join the ESP32's AP, then return and tap Connect — a 4-step out-of-app process.

**UX pain points in the current BLE flow:**

| Issue                     | Current behavior                                  | User impact                                         |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| No onboarding             | Auto-scans on first launch with no context        | User doesn't know the feeder must be powered on     |
| Permission fails silently | Dialog pops behind the scan card                  | User denies without understanding why               |
| Opaque spinner            | Infinite "Connecting…" with no timeout indication | User waits indefinitely for a dead feeder           |
| Raw RSSI numbers          | `RSSI -67 dBm` in device list                     | Non-technical users don't understand signal quality |
| Forget buried             | Only accessible from connected state              | Dead feeder → stuck in "Connecting…" forever        |
| Stored feeder lock-in     | Only auto-connects to stored chipId               | Other nearby feeders are invisible                  |
| No disconnect feedback    | Data silently freezes then flips to scanning      | User doesn't know connection dropped                |
| Dual-useEffect race       | Two chained effects drive scan→connect            | Overlapping states, potential infinite loops        |

**Goal:** A single-transport BLE flow where every state is explicit, the user always knows what's happening, and they always have a path forward.

---

## Requirements Trace

- **R1.** Remove all MQTT client code, SoftAP fallback UI, and `FeederLinkPhase` state machine. BLE is the only transport.
- **R2.** Guided first-use onboarding: explain Bluetooth requirement, prime permissions before requesting, fall back to a Settings deep-link on denial.
- **R3.** Visual signal strength (0–4 bars) and estimated distance (meters) replace raw RSSI in scan results.
- **R4.** Tiered connection timeout: "Looking…" (0–8s) → "Still searching…" (8–20s) → "Can't find" (>20s) with troubleshooting checklist.
- **R5.** Connection Lost state: toast notification, frozen dashboard data, timed auto-reconnect attempt, escalation to error state on failure.
- **R6.** "Forget this feeder" accessible from error/not-found states, with confirmation dialog.
- **R7.** When stored feeder isn't found but other FloydFeeders are nearby, surface them with a "Connect to this instead" option.
- **R8.** Animated transitions: fade skeletons in/out, LayoutAnimation on state changes, scale-down on disconnect.
- **R9.** Replace the dual-`useEffect` chain with an explicit state machine driven by dispatched events, not derived state.

---

## Scope Boundaries

- **In scope:** All app-side connection UI, BLE state management (`useESP32Context`), `useBLEDiscovery`, `useBLETransport`, dashboard transitions, `ESP32Connection` component.
- **Deferred to Follow-Up Work:** ESP32 firmware changes (removing sMQTTBroker dependency, stripping SoftAP mode, removing the `switch_mode` handler). The firmware can continue running the broker code — the app just won't use it. A separate firmware cleanup plan should follow.
- **Not in scope:** Nicknames/labels for feeders, multi-feeder management, BLE bonding/pairing security, Coded PHY improvements (already implemented in `docs/plan-connectivity-improvements.md`).

---

## Context & Research

### Relevant Code and Patterns

- **`hooks/useESP32Context.tsx`** — Central context provider. Contains the dual-`useEffect` chain (lines ~310–360), `feederLinkPhase` state, MQTT hook integration, and all transport-agnostic commands. This is the core file to refactor.
- **`components/ESP32Connection.tsx`** — Connection UI card with 4 conditional blocks gated on `feederLinkPhase` and `isConnected`. Each block is a `StatCard` with different content.
- **`hooks/useBLEDiscovery.ts`** — BLE scan orchestration. Already has permission checking, but it's inline in `startScan`. Needs a separate permission-priming flow.
- **`hooks/useBLETransport.ts`** — BLE GATT connection. Has `switchToAp()` (to be removed). The `onDisconnected` callback sets `isConnected=false` but doesn't propagate a reason.
- **`hooks/useMQTT.ts`** — Full MQTT client with wildcard discovery, reconnect, and publish. To be deleted entirely.
- **`hooks/transportTypes.ts`** — Type definitions. `ActiveTransport`, `FeederLinkPhase`, `DiscoveredFeederBle`.
- **`app/(tabs)/index.tsx`** — Dashboard screen. Has MQTT-specific WiFi signal card, skeleton loaders, and references `activeTransport`.
- **`hooks/bleConstants.ts`** — BLE UUIDs and device name parsing. No distance helpers currently.

### Institutional Learnings

- `docs/plan-connectivity-improvements.md` — BLE retry logic and TX power changes already implemented. These improve connection reliability and reduce the need for a fallback.
- `docs/plans/2026-05-06-ble-primary-wifi-fallback.md` — The plan that produced the current code. Documents the decision to use BLE primary + SoftAP fallback. This plan supersedes that decision for the app side.

### External References

- React Native `LayoutAnimation` API — built-in, no dependency needed, supports `configureNext()` for state transitions.
- React Native `PermissionsAndroid` — `requestMultiple()` for Android 12+ Bluetooth permissions, `openSettings()` for deep-linking.
- BLE RSSI path-loss model — n=2.5 for indoor environments, txPower=-40 dBm at 1m for ESP32. Rough estimate only; bars are the primary visual.

---

## Key Technical Decisions

- **Explicit state machine over derived effects.** Replace the `useEffect` chain (scan when not connected, auto-connect when device found) with explicit transitions dispatched from event handlers. States: `idle`, `scanning`, `connecting`, `connected`, `error`. The `wasConnected` flag differentiates "first connect failed" from "connection dropped."
- **Distance from RSSI is advisory, not authoritative.** RSSI fluctuates ±10 dBm moment to moment. Show signal bars as the primary indicator, estimated distance as secondary text. Don't use distance for any logic decisions.
- **Permission priming before system dialog.** On Android 12+, request BT permissions only after showing a "Why we need Bluetooth" card. On denial, deep-link to system settings — don't just show a message.
- **Keep device data frozen on disconnect.** Don't clear `deviceData` when BLE drops. Overlay a "Connection Lost" banner and keep last-known values visible. This prevents the jarring "data disappears" experience.
- **Forget from any state.** The "Forget" action clears AsyncStorage and transitions to `idle`/onboarding regardless of current state. Safety valve for dead/replaced feeders.

---

## Open Questions

### Resolved During Planning

- **Should we keep MQTT for any scenario?** No — user confirmed "dont need the fallback." BLE range is sufficient for a fish feeder used at arm's length.
- **Permission priming vs auto-request?** Prime first. An extra tap is worth the user understanding why Bluetooth access is needed.
- **Frozen data vs cleared on disconnect?** Frozen with overlay. Cleared data is confusing.
- **Signal bars vs raw RSSI?** Bars primary, distance secondary. No raw dBm in the UI.

### Deferred to Implementation

- Exact animation durations and easing curves — tune visually after the state machine works.
- Timeout thresholds (8s/20s) — may need adjustment based on real-world BLE scan latency.
- Whether to debounce the auto-connect match (find device → wait 300ms → connect) or connect immediately — depends on how often duplicate scan results fire.

---

## Implementation Units

### U1. Define new types and state machine constants

**Goal:** Replace `ActiveTransport`, `FeederLinkPhase` with `ConnectionState`, `ConnectionError`, and add RSSI helpers.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**

- Modify: `hooks/transportTypes.ts`
- Modify: `hooks/bleConstants.ts`

**Approach:**

- `transportTypes.ts`: Remove `ActiveTransport` and `FeederLinkPhase`. Add `ConnectionState` union type (`"idle" | "scanning" | "connecting" | "connected" | "error"`), `ConnectionErrorKind`, and `ConnectionError` interface. Keep `DiscoveredFeederBle` but add `estimatedDistanceM: number`.
- `bleConstants.ts`: Add `rssiToDistanceM(rssi, txPower?)` using a simplified path-loss model (n=2.5, txPower=-40 dBm). Add `rssiToBars(rssi)` returning 0–4. Export both.

**Patterns to follow:** Existing `DiscoveredFeederBle` interface shape. Keep UUID constants unchanged.

**Test scenarios:**

- Happy path: `rssiToDistanceM(-40)` returns ~0.3m (at reference distance)
- Happy path: `rssiToDistanceM(-67)` returns ~12m
- Edge case: `rssiToDistanceM(-30)` clamps to minimum 0.3m (stronger than reference)
- Edge case: `rssiToDistanceM(-120)` clamps to maximum 30m
- Happy path: `rssiToBars(-45)` returns 4 bars
- Edge case: `rssiToBars(-95)` returns 0 bars
- Edge case: `rssiToBars(-50)` returns 4 bars (boundary)

**Verification:**

- TypeScript compiles with no errors on the modified files
- `rssiToDistanceM` and `rssiToBars` produce expected values for boundary inputs
- `DiscoveredFeederBle` includes `estimatedDistanceM`

---

### U2. Update BLE discovery hook

**Goal:** Add separate permission-priming flow, distance estimation on scan results, and Settings deep-link on denial.

**Requirements:** R2, R3

**Dependencies:** U1

**Files:**

- Modify: `hooks/useBLEDiscovery.ts`

**Approach:**

- Expose `permissionStatus` state (`"unknown" | "granted" | "denied"`), `requestPermissions()`, and `openAppSettings()`.
- `requestPermissions()` checks Android permissions without starting a scan — allows the onboarding card to prime before requesting.
- `openAppSettings()` calls `Linking.openSettings()` (Android) or `Linking.openURL("app-settings:")` (iOS).
- In `startScan()`, check Bluetooth power state first, then permissions. Both produce clear error messages.
- Apply `rssiToDistanceM` to each discovered device. Sort devices by estimated distance (closest first).
- Keep existing `stopScan`, `clearDiscovered`, `useMountEffect` cleanup unchanged.

**Patterns to follow:** Existing `ensureAndroidBlePermissions()` helper structure. `PermissionsAndroid.requestMultiple()` API.

**Test scenarios:**

- Happy path: `requestPermissions()` returns `"granted"` on iOS (no-op, always granted)
- Happy path: `requestPermissions()` returns `"granted"` on Android 13+ when both BT permissions granted
- Error path: `requestPermissions()` returns `"denied"` when user denies BT scan permission
- Error path: `startScan()` sets error when Bluetooth is powered off
- Error path: `startScan()` sets error when permissions are denied
- Happy path: Scan result device has `estimatedDistanceM` populated from RSSI
- Happy path: Devices are sorted by distance ascending

**Verification:**

- `permissionStatus` is `"unknown"` on mount (not yet checked)
- `requestPermissions()` can be called independently before `startScan()`
- Scan does not start if permissions denied; error message includes "Settings" reference
- `openAppSettings()` opens system settings for the app

---

### U3. Update BLE transport hook

**Goal:** Remove MQTT-specific `switchToAp()`, add disconnect reason propagation, simplify to BLE-only.

**Requirements:** R1, R5

**Dependencies:** U1

**Files:**

- Modify: `hooks/useBLETransport.ts`

**Approach:**

- Remove `switchToAp()` function and its export.
- The `onDisconnected` callback currently sets `isConnected=false` internally. Keep this but also accept an optional `onDisconnect` callback in `UseBLETransportOptions` so the context can react (enter reconnecting state).
- Add `disconnectReason: string | null` to the return value — populated when `onDisconnected` fires with an error.
- Keep all other functions unchanged: `connect`, `disconnect`, `writeCommandPayload`, `syncTime`, `readSchedulesFromCharacteristic`, `writeSchedulesChunked`, `refreshRssi`.
- Keep the 2-attempt connection retry (already implemented in `docs/plan-connectivity-improvements.md`).

**Patterns to follow:** Existing `onMessage` callback pattern — same shape, different event.

**Test scenarios:**

- Happy path: `connect()` succeeds on first attempt, `isConnected=true`
- Edge case: `connect()` succeeds on retry after first attempt fails
- Error path: `connect()` fails after all retries, `error` is set
- Integration: `onDisconnected` fires when BLE drops, callback is invoked with reason
- Happy path: `syncTime()` writes 4-byte Unix timestamp successfully
- Regression: `writeCommandPayload`, `readSchedulesFromCharacteristic`, `writeSchedulesChunked` still work

**Verification:**

- `switchToAp` no longer exists in the hook's return type
- `onDisconnect` callback fires when device disconnects
- `disconnectReason` is populated on unexpected disconnects

---

### U4. Rewrite ESP32 context provider

**Goal:** Replace the `feederLinkPhase` + dual-`useEffect` chain with an explicit state machine. Remove all MQTT integration. Add auto-reconnect, disconnect handling, and new context API surface.

**Requirements:** R1, R4, R5, R6, R7, R9

**Dependencies:** U1, U2, U3

**Files:**

- Modify: `hooks/useESP32Context.tsx`

**Approach:**

**State machine:**

```
States: idle | scanning | connecting | connected | error
Transitions:
  idle → scanning        (user taps "Find My Feeder" or auto-start with stored chipId)
  scanning → connecting  (device found matching chipId, or user taps a device)
  scanning → error       (timeout ~15s with no devices found)
  connecting → connected (BLE connect success)
  connecting → error     (BLE connect failure or timeout)
  connected → scanning   (BLE disconnect detected, wasConnected=true)
  error → scanning       (user taps "Try again")
  error → idle           (user taps "Forget this feeder")
  any → idle             (user taps "Forget" — clears chipId)
```

**Key changes from current:**

1. Replace `feederLinkPhase` with `connectionState: ConnectionState`.
2. Remove all MQTT imports (`useMQTT`), MQTT state (`mqttConnected`, `mqttConnecting`, `mqttError`), MQTT connection logic (`mqttConnect`, `mqttDisconnect`, `mqttResetConnection`, `beginApWifiFallback`, `connectMqttToSoftAp`).
3. Remove `activeTransport` — it's always `"ble"` now.
4. Add `wasConnected: boolean` to differentiate "first connect failed" from "connection dropped."
5. Add `connectionError: ConnectionError | null` with structured error info.
6. Add `connectionElapsedMs: number` — time since scan/connect started, for tiered timeout UI.
7. Replace dual-`useEffect` scan/connect chain with explicit functions:
   - `startConnection()` — begins the scan→connect pipeline for the stored chipId
   - `connectToDevice(deviceId, chipId)` — user selects a device from the list
   - `retryConnection()` — re-enters scanning from error state
   - `forgetFeeder()` — clears chipId, disconnects, returns to idle
8. BLE disconnect handling: when `onDisconnected` fires, transition to `scanning` state (not error — try to reconnect first). After 3 failed reconnect attempts or 30s, escalate to `error` with `connectionError.kind = "connection_lost"`.
9. `deviceData` is NOT cleared on disconnect — keep frozen values.
10. Timer tracking: record `Date.now()` on state entry to `scanning`/`connecting`, expose `connectionElapsedMs` via a `useEffect` interval.
11. When scanning and stored chipId not found but OTHER feeders are present, expose them via `bleDevices` (already works). The UI in U5 handles the "your feeder not found but others are" case.

**Context type changes (removals):**

- Remove: `activeTransport`, `feederLinkPhase`, `connectMqttToSoftAp`, `beginApWifiFallback`
- Remove: `publishScheduleSync` MQTT path, `reloadSchedules` MQTT path (keep BLE paths)
- Remove: `connect`, `disconnect`, `resetConnection` (replaced by `startConnection`, `retryConnection`, `forgetFeeder`, `disconnectBle`)

**Context type changes (additions):**

- Add: `connectionState: ConnectionState`
- Add: `wasConnected: boolean`
- Add: `connectionError: ConnectionError | null`
- Add: `connectionElapsedMs: number`
- Add: `startConnection: () => void`
- Add: `connectToDevice: (deviceId: string, chipId: string) => void`
- Add: `retryConnection: () => void`
- Add: `forgetFeeder: () => void`

**Patterns to follow:** Existing `useCallback` + `useMemo` pattern for context value. Keep `handleMessage`, `feedLogs`, `sensorLogs`, schedule sync unchanged.

**Test scenarios:**

- Happy path: First launch → idle state, onboarding card visible
- Happy path: `startConnection()` → scanning → device found → connecting → connected
- Happy path: Stored chipId, feeder in range → auto-transitions through scanning→connecting→connected
- Edge case: Scan finds no devices within 15s → error state with `no_devices` kind
- Edge case: Connect fails with error → error state with `connection_failed` kind
- Edge case: Connected then BLE drops → scanning state (auto-reconnect), `wasConnected=true`
- Edge case: 3 reconnect attempts fail → error state with `connection_lost` kind
- Edge case: `forgetFeeder()` from error state → idle state, chipId cleared from AsyncStorage
- Regression: `startFeed`, `stopFeed`, `clearJam`, `requestSensorData` still work after refactor
- Regression: Schedule CRUD (read/write) still works over BLE
- Regression: Time sync fires on connect

**Verification:**

- TypeScript compiles with no MQTT references in the context file
- `connectionState` transitions follow the state machine diagram
- Auto-reconnect triggers on BLE disconnect, not on manual disconnect
- `deviceData` persists through disconnect→reconnect cycle
- `forgetFeeder` clears chipId from AsyncStorage (verify via `AsyncStorage.getItem("floydChipId")`)

---

### U5. Rewrite ESP32Connection component

**Goal:** Replace the 4 conditional blocks with a clean state-driven UI. Add onboarding, permissions, tiered timeout, signal bars, error troubleshooting, and animated transitions.

**Requirements:** R2, R3, R4, R5, R6, R7, R8

**Dependencies:** U4

**Files:**

- Modify: `components/ESP32Connection.tsx`

**Approach:**

Replace the current `if/else` chain on `feederLinkPhase` + `isConnected` with a `switch` on `connectionState`:

| State                   | Card title                        | Content                                                                                                                                                              |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`                  | "Welcome to Floyd"                | Logo, "Power on your feeder and enable Bluetooth", "Find My Feeder" button. If permissions unknown, explain first. If permissions denied, show "Open Settings" link. |
| `scanning` (no chipId)  | "Find Your Feeder"                | Animated radar/search icon. Device list with signal bars + distance. "Scanning…" indicator. "Cancel" button.                                                         |
| `scanning` (has chipId) | "Looking for Your Feeder"         | Animated radar. "Searching for FloydFeeder-XXXX…" with elapsed time. If other feeders found: "Your feeder isn't nearby, but we found:" with list.                    |
| `connecting`            | "Connecting…"                     | Device name badge. Tiered messages: 0–8s "Establishing connection…", 8–20s "Still trying… Make sure it's powered on and nearby", >20s → auto-transition to error.    |
| `connected`             | "Connected"                       | Green indicator + chipId. RSSI bars. Disconnect / Reconnect / Forget buttons.                                                                                        |
| `error`                 | depends on `connectionError.kind` | Specific troubleshooting for each kind. "Try again" / "Forget this feeder" buttons. If `wasConnected`, show "Connection lost" header.                                |

**Signal strength display:** Render 5 dots (○/⬤) based on `rssiToBars()`. Show estimated distance as "~2m away."

**Forget confirmation:** Use `Alert.alert()` with "Are you sure? You'll need to pair again next time." before calling `forgetFeeder()`.

**Tiered timeout:** Read `connectionElapsedMs` from context. Use a `useEffect` interval (every 1s) to check thresholds and update local UI state (no context state change until the 20s mark where we auto-transition to error).

**Animated transitions:** Wrap the entire card in a component that calls `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` on state change. Add `Animated.Value` for opacity fades when entering/leaving the connected state.

**Other feeders surfaced:** When `connectionState === "scanning"` and `chipId` is set, filter `bleDevices` for non-matching chipIds. Show a "Not your feeder? Connect anyway" section below the "Looking for…" message.

**Patterns to follow:** Existing `StatCard` wrapper, `IconSymbol`, `TouchableOpacity` button styles. Keep the same `StyleSheet` pattern and `Colors` theming.

**Test scenarios:**

- Happy path: First launch → "Welcome" card → tap "Find" → permissions dialog → scan list appears
- Happy path: Device found in scan → tap → connecting → connected
- Edge case: Permissions denied → "Open Settings" link visible → tapping opens system settings
- Edge case: Scan runs for 20s, no devices → transitions to error state with "No feeders found"
- Edge case: Stored feeder not found, but other feeder nearby → "Your feeder isn't nearby" section with the other feeder listed
- Edge case: Connected, then BLE drops → "Connection lost" overlay, auto-reconnect indicator
- Edge case: 3 reconnect attempts fail → error state with "Connection lost" header
- Edge case: "Forget" from error state → confirmation dialog → returns to idle/welcome
- UI: Signal bars render correctly for RSSI values (-40→4 bars, -70→2 bars, -95→0 bars)
- UI: Distance text shows "~2m away" style

**Verification:**

- All 6 states render the correct card content
- Forget confirmation dialog appears before clearing
- Signal bars update when RSSI changes (connected state)
- Tiered messages change at 8s and 20s thresholds
- "Other feeders" section appears when applicable
- LayoutAnimation fires on state transition (no jarring jumps)

---

### U6. Update dashboard screen

**Goal:** Remove MQTT-specific UI (WiFi signal card), add animated transitions for skeleton→live and live→disconnected, add Connection Lost overlay.

**Requirements:** R5, R8

**Dependencies:** U5

**Files:**

- Modify: `app/(tabs)/index.tsx`

**Approach:**

- Remove the `activeTransport === "mqtt"` conditional block (WiFi signal card + RSSI bars). The entire WiFi stats section goes away.
- Remove `activeTransport` from the destructured context — replace with `connectionState`, `wasConnected`, `connectionError`.
- Skeleton transition: When transitioning from `connecting`/`scanning` to `connected`, fade skeletons out over 200ms while real cards fade in. Use `Animated.Value` for opacity.
- Disconnect overlay: When `wasConnected && connectionState !== "connected"`, render a semi-transparent overlay on the data cards with "Connection Lost — Reconnecting…" text. Scale cards to 0.97 with `Animated.spring`.
- Keep all existing dashboard content: Device Status, Motor Status, Feeder Capacity, Water Temp, Alerts.
- Remove references to `activeTransport` in any other conditional UI.

**Patterns to follow:** Existing `Animated` usage (none currently — this adds the first `Animated.Value` usage). Keep `RefreshControl`, `ScrollView`, `SafeAreaView` structure.

**Test scenarios:**

- Happy path: Dashboard loads, skeletons appear during connection, real data fades in on connect
- Edge case: BLE disconnects → overlay appears with "Connection Lost", data cards scale down
- Edge case: Auto-reconnect succeeds → overlay disappears, cards scale back to 1.0
- Regression: All existing dashboard cards (Device Status, Motor, Capacity, Temp, Alerts) render correctly
- Regression: Pull-to-refresh still triggers `requestSensorData()`

**Verification:**

- No `activeTransport` references remain in index.tsx
- WiFi signal card is gone
- Skeleton→live transition is smooth (no flash)
- Disconnect overlay renders on top of data cards
- Dashboard is functional end-to-end: connect → see data → disconnect → overlay → reconnect → data returns

---

### U7. Delete MQTT hook and clean up

**Goal:** Remove the unused `useMQTT.ts` file and any remaining MQTT references across the codebase.

**Requirements:** R1

**Dependencies:** U4 (must not import useMQTT anymore)

**Files:**

- Delete: `hooks/useMQTT.ts`
- Modify: `package.json` (optional — remove `mqtt` dependency if no other consumers)

**Approach:**

- Delete `hooks/useMQTT.ts` entirely.
- Check `package.json` — if `mqtt` is only used by this file, remove the dependency and run `npm uninstall mqtt`.
- Grep the codebase for any remaining imports of `useMQTT` or `./useMQTT` — should be zero after U4.
- Check for any remaining references to `ActiveTransport`, `FeederLinkPhase`, `feederLinkPhase`, `activeTransport` — should be zero after all units.

**Test scenarios:**

- Test expectation: none — pure deletion and cleanup. Verify via build.

**Verification:**

- `hooks/useMQTT.ts` does not exist
- `grep -r "useMQTT" hooks/ app/ components/` returns no results
- `grep -r "activeTransport\|feederLinkPhase\|ActiveTransport\|FeederLinkPhase" hooks/ app/ components/` returns no results
- `npx tsc --noEmit` passes
- `npx expo start` launches without import errors

---

## System-Wide Impact

- **Interaction graph:** `useESP32Context` is consumed by `DashboardScreen` (index.tsx), `ControlsScreen` (controls.tsx), `ScheduleScreen` (schedule.tsx), `HistoryScreen` (history.tsx), and `ESP32Connection`. The context API surface changes (method renames, new state fields) but the core command methods (`startFeed`, `stopFeed`, `clearJam`, `requestSensorData`, `reloadSchedules`, `publishScheduleSync`) keep their signatures. Controls, Schedule, and History screens should need zero changes — they only consume command methods and `isConnected`/`deviceData`.
- **Error propagation:** Connection errors are now structured (`ConnectionError`) and surfaced through `connectionError` in context. Dashboard and Connection card consume this; other screens are unaffected.
- **State lifecycle risks:** The explicit state machine eliminates the dual-effect race condition. New risk: the auto-reconnect loop could thrash if BLE repeatedly connects and drops. Mitigation: 3-attempt limit before escalating to error.
- **API surface parity:** All BLE GATT operations (command write, telemetry notify, schedule read/write, time sync) are unchanged. Only the transport selection and mode-switching logic is removed.
- **Unchanged invariants:** `deviceData` shape, `FeedLogEntry`/`SensorLogEntry` types, schedule sync over BLE, alert derivation, AsyncStorage keys (`floydChipId`, `floyd-feedlogs`). These are load-bearing and untouched.

---

## Risks & Dependencies

| Risk                                                                         | Mitigation                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing MQTT may break users who rely on the fallback                       | The Wi-Fi fallback was a manual 4-step process that required leaving the app. Real-world usage is likely near-zero. BLE improvements (retry, TX power from prior plan) make it more reliable than before. |
| State machine bugs (wrong transition, stuck state)                           | The state machine has 5 states and 8 transitions — small enough to reason about. Each transition is an explicit function call, not derived state.                                                         |
| `LayoutAnimation` on Android may have quirks                                 | Use `UIManager.setLayoutAnimationEnabledExperimental(true)` on Android. Test on both platforms.                                                                                                           |
| `PermissionsAndroid.requestMultiple` behavior varies across Android versions | Already battle-tested in the current codebase. The new `requestPermissions()` just extracts the check from `startScan()`.                                                                                 |
| App rebuild required (native module changes)                                 | No native module changes. This is pure JS/TS refactor. Hot reload should work.                                                                                                                            |

---

## Sources & References

- **Origin document:** `docs/plans/2026-05-06-ble-primary-wifi-fallback.md` — the v3 plan this supersedes on the app side
- Related code: `hooks/useESP32Context.tsx`, `components/ESP32Connection.tsx`, `hooks/useBLEDiscovery.ts`, `hooks/useBLETransport.ts`, `hooks/useMQTT.ts`
- Prior improvements: `docs/plan-connectivity-improvements.md` — BLE TX power, retry logic
- React Native docs: `LayoutAnimation`, `PermissionsAndroid`, `Animated`
