# BLE Primary + Direct AP Fallback — Connection Architecture v3

**Goal:** Redesign the app↔ESP32 connection to use BLE as the primary transport with Direct AP (SoftAP + MQTT) as a manual fallback. Eliminate Home WiFi mode entirely.

**Architecture:**

```
Normal operation:     App ←──(BLE GATT)──→ ESP32 (BLE server)
Direct AP fallback:   App ←──(MQTT)──────→ ESP32 (SoftAP + broker)
Mode switching:       BLE command triggers AP mode; disconnect or timeout returns to BLE
```

**Tech Stack Changes:**

| Layer | Add                              | Remove                                          | Keep                                              |
| ----- | -------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| App   | `react-native-ble-plx`           | `react-native-zeroconf`, `react-native-webview` | `mqtt`, `react-native-quick-base64`, AsyncStorage |
| ESP32 | ESP32 BLE Arduino (NimBLE stack) | WiFiManager, ezTime, ESPmDNS                    | sMQTTBroker, ArduinoJson, Preferences (NVS)       |

---

## Decision Recap

| #   | Decision              | Choice                                                                              |
| --- | --------------------- | ----------------------------------------------------------------------------------- |
| 1   | Primary connection    | BLE (GATT server on ESP32)                                                          |
| 2   | Fallback connection   | Direct AP (SoftAP + MQTT), manual trigger only                                      |
| 3   | Home WiFi / mDNS mode | Removed entirely                                                                    |
| 4   | First-time setup      | Two-tap BLE scan → connect (no WiFi provisioning)                                   |
| 5   | Mode switching        | BLE command → ESP32 stops BLE, starts AP+MQTT. Disconnect/timeout → returns to BLE  |
| 6   | Scheduling            | Lightweight ESP32 cron with BLE time sync from phone (tolerates ~5 min drift)       |
| 7   | BLE payload strategy  | All data over BLE (commands, telemetry, schedules) with chunking for >512B payloads |
| 8   | BLE security          | Open (no pairing/PIN) — same trust model as current plaintext MQTT                  |
| 9   | ESP32 radio           | Single-radio device — BLE mode OR AP mode, never both                               |
| 10  | Provisioning UI       | Removed (`provision.tsx` + WebView WiFiManager portal)                              |
| 11  | NTP                   | Removed (`ezTime` dependency stripped)                                              |
| 12  | Time source           | Phone pushes Unix timestamp via BLE on every connection                             |

---

## BLE GATT Service Design

### Service: Floyd Feeder Control

| Characteristic | UUID suffix | Properties   | Payload                                       | Description                                   |
| -------------- | ----------- | ------------ | --------------------------------------------- | --------------------------------------------- |
| Command        | `2A01`      | Write        | JSON `{action, parameters, timestamp}`        | Start/stop feed, clear jam, ping, mode switch |
| Response       | `2A02`      | Notify       | JSON `{type, data, timestamp}`                | Command responses (feed_complete, errors)     |
| Telemetry      | `2A03`      | Notify       | JSON `{type:"sensor_data", data:{...}}`       | Periodic sensor + motor state                 |
| Status         | `2A04`      | Read, Notify | JSON `{type:"status", data:{...}}`            | Connection state, uptime, free heap, config   |
| Schedules      | `2A05`      | Write, Read  | JSON array (chunked if >512B)                 | Schedule CRUD                                 |
| Config         | `2A06`      | Write, Read  | JSON `{cylinderRadius, ...}`                  | Container geometry, sensor interval           |
| Time           | `2A07`      | Write        | uint32 (4-byte Unix timestamp, little-endian) | Phone → ESP32 time sync                       |
| Feed Log       | `2A08`      | Notify       | JSON `{id, timestamp, augerSpeed, ...}`       | Feed completion events                        |

### Chunking Protocol (Schedules, large payloads)

For GATT writes exceeding the MTU (negotiated 512 bytes):

1. App splits JSON into 480-byte chunks (leaving room for header)
2. Each chunk written as: `[chunk_index:u2][total_chunks:u2][payload:N]`
3. ESP32 accumulates chunks until all received, then parses complete JSON
4. ESP32 responds with `ack_chunks` or `error` on the Response characteristic

---

## Implementation Units

### Phase 1: ESP32 Firmware

- [ ] **U1. Strip removed features from firmware**

**Goal:** Remove Home WiFi provisioning, NTP, mDNS, and WebView portal code. Keep motor control, scheduler core, MQTT broker, and NVS config storage.

**Dependencies:** None

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Approach:**

- Remove `ezTime` include, `syncNTP()`, all `UTC.dateTime()` calls, and `waitForSync()`
- Remove `ESPmDNS` include and all `MDNS.begin/addService` calls
- Remove WiFiManager captive portal code (if any remains in current revision)
- Remove NVS WiFi credential fields (`wifiSSID`, `wifiPassword`, `provisioned`) from `AppConfig` struct
- Remove `connectToWiFi()`, `onWiFiEvent()`, `checkWiFiConnection()`, and WiFi watchdog reboot logic
- Keep `Preferences` (NVS) for container config and schedules — only WiFi creds are stripped
- Keep `sMQTTBroker` include and broker init (used in Direct AP mode, Phase 2)
- Keep `ArduinoJson` include (used for BLE payloads + MQTT payloads)
- Keep motor state machine, `startFeeding()`, `stopAllMotors()`, `updateMotorState()` unchanged

**Patterns to follow:** Current `ESP32_MQTT_Server.ino` structure — strip by section, don't reorganize.

**Test scenarios:**

- Firmware compiles without ezTime, ESPmDNS, WiFiManager includes
- ESP32 boots without attempting WiFi STA connection
- Container config and schedules survive NVS format change (test: flash new firmware over existing NVS — schedules preserved)
- Motor test command (serial monitor) still works

**Verification:**

- Firmware compiles and uploads via Arduino IDE
- Serial monitor shows no WiFi/MQTT/mDNS initialization
- `Preferences` data (schedules, config) is readable after flash

---

- [ ] **U2. Add BLE GATT server to firmware**

**Goal:** Implement the complete GATT service with all 8 characteristics on the ESP32.

**Dependencies:** U1

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Approach:**

- Add `#include <NimBLEDevice.h>` (NimBLE stack — lighter than Bluedroid, better coexistence)
- Define service UUID: custom 128-bit `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- Define characteristic UUIDs: suffixes as listed in GATT design above
- Create `NimBLEServer`, `NimBLEService`, `NimBLECharacteristic` instances
- Implement callbacks:
  - `onWrite(Command)` → enqueue for `handleMQTTMessage()` (reuse existing command handler — it already parses JSON `{action, parameters}` — same format)
  - `onWrite(Schedules)` → accumulate chunks, parse JSON, call existing schedule save logic
  - `onWrite(Config)` → parse JSON, update `cfg`, call `saveConfig()`
  - `onWrite(Time)` → read uint32, set ESP32 internal RTC via `setTime()` (built-in, no library needed)
  - `onRead(Status)` → return current status JSON
  - `onRead(Schedules)` → return schedules JSON (chunked if > MTU)
- Replace `broadcastSensorData()` to also notify BLE Telemetry characteristic
- Replace `broadcastResponse()` to also notify BLE Response characteristic
- Replace `sendDeviceStatus()` to update BLE Status characteristic
- Keep MQTT publish calls intact (they become no-ops when broker isn't running)
- Advertising: `FloydFeeder-{chipId}` as device name, 128-bit service UUID in advertisement data

**Execution note:** Start with a minimal BLE server (one characteristic) and verify phone can discover + connect before building out all 8 characteristics.

**Patterns to follow:** NimBLE examples (`NimBLEDevice::init`, `createServer`, `createService`, `createCharacteristic`)

**Test scenarios:**

- Happy path: Phone discovers `FloydFeeder-{chipId}` in BLE scan
- Happy path: Write Command characteristic → ESP32 parses JSON and responds on Response characteristic
- Happy path: Write Time characteristic → ESP32 internal clock updates
- Happy path: Telemetry characteristic notifies with sensor data at configured interval
- Edge case: Chunked schedule write (4+ schedules, 2KB) → ESP32 reassembles and parses
- Edge case: Rapid successive writes (command spam) → ESP32 doesn't crash or drop commands
- Error path: Invalid JSON on Command characteristic → error response on Response characteristic
- Error path: BLE disconnect mid-chunk → ESP32 resets chunk buffer

**Verification:**

- nRF Connect or LightBlue app can discover, connect, and read/write all characteristics
- Serial monitor shows BLE events (connect, write, notify)
- Existing motor/sensor code works unchanged through the new BLE command path

---

- [ ] **U3. Add BLE↔AP mode switching to firmware**

**Goal:** ESP32 can switch between BLE-only mode and Direct AP (SoftAP + MQTT broker) mode on command.

**Dependencies:** U2

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Approach:**

- Define two operating modes: `MODE_BLE` (default) and `MODE_AP`
- On boot, start in `MODE_BLE`: init BLE server, start advertising, do NOT start SoftAP or MQTT broker
- Command handler: when action is `switch_mode` with `parameters.mode: "ap"`:
  1. Stop BLE advertising (`pServer->getAdvertising()->stop()`)
  2. Start WiFi SoftAP: `WiFi.mode(WIFI_AP)`, `WiFi.softAP("FloydFeeder-{chipId}")`
  3. Init MQTT broker: `broker.init(1883)`
  4. Notify mode change on Response characteristic before stopping BLE
- Return to BLE mode:
  - Trigger: MQTT client disconnects AND no MQTT activity for 30 seconds (timeout watchdog)
  - OR: BLE command `switch_mode` with `parameters.mode: "ble"` (but this requires BLE to be up — use only when SoftAP was triggered by timeout, not by user disconnect)
  - Actually: the phone should send an MQTT command `switch_mode: "ble"` before disconnecting, which the ESP32 acts on, stops the broker + SoftAP, and restarts BLE advertising
  - Fallback: 60-second inactivity timeout — if no MQTT messages received for 60s, auto-return to BLE
- Important: `WiFi.mode(WIFI_AP)` before `broker.init(1883)` — broker's internal WiFiServer requires WiFi initialized first (existing constraint)

**Patterns to follow:** Current `setup()` function's AP init logic, extracted into a switchable function.

**Test scenarios:**

- Happy path: Boot → BLE advertising → send switch_mode:"ap" → ESP32 stops BLE, starts AP → phone connects to FloydFeeder WiFi → MQTT connects on 192.168.4.1:1883
- Happy path: Send MQTT switch_mode:"ble" → ESP32 stops AP+broker → restarts BLE advertising → phone discovers via BLE
- Edge case: 60s MQTT inactivity timeout → ESP32 auto-returns to BLE
- Edge case: BLE disconnect during mode switch → ESP32 handles gracefully (switch proceeds)
- Error path: broker.init() fails → ESP32 falls back to BLE mode with error logged

**Verification:**

- Serial monitor confirms mode transitions with timestamps
- Phone can switch modes back and forth 5 times without ESP32 crash or memory leak
- Free heap reported in status characteristic remains stable across mode switches

---

- [ ] **U4. Add lightweight scheduler with BLE time sync**

**Goal:** Replace NTP-dependent scheduling with ESP32 internal clock + BLE time sync from phone.

**Dependencies:** U1, U2

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Approach:**

- Remove all `ezTime` calls (`UTC.dateTime()`, `waitForSync()`, `events()`, `timeStatus()`)
- Use Arduino `time.h` / `sys/time.h` — `settimeofday()` on ESP32 sets the system clock
- BLE Time characteristic write handler: read 4-byte uint32 (Unix timestamp), call:
  ```cpp
  struct timeval tv;
  tv.tv_sec = unixTimestamp;
  tv.tv_usec = 0;
  settimeofday(&tv, NULL);
  ```
- Replace `checkSchedules()` time checks:
  - Use `time()` instead of `UTC.dateTime()`
  - `localtime_r()` to get `tm_hour`, `tm_min`, `tm_wday` (0=Sun)
  - Compare against schedule fields
- Remove `syncNTP()` and `lastNtpUpdate` from loop
- Keep `checkSchedules()` call in loop — it runs on whatever time the ESP32 has
- On boot, time defaults to 0 (Jan 1 1970). Scheduler won't fire until phone syncs time. This is correct — the feeder shouldn't feed until a phone has connected at least once.
- Add a status flag `time_synced` reported in Status characteristic so the app knows if the ESP32 needs a time sync

**Test scenarios:**

- Happy path: Phone writes Unix timestamp → ESP32 time updates → `time()` returns correct value
- Happy path: Schedule fires at correct local time after time sync
- Edge case: ESP32 boots with time=0 → scheduler never fires → app sees time_synced=false → syncs time → scheduler works
- Edge case: Phone disconnects for 3 days → ESP32 clock drifts by ~2-3 minutes → schedule fires within acceptable window
- Error path: Invalid time value (0, negative, year 2100+) → ESP32 rejects, keeps current time

**Verification:**

- Serial monitor shows time before and after BLE time sync
- Schedule set to "1 minute from now" fires within ±5 seconds
- After 24h without phone connection, schedule fires within ±30 seconds

---

### Phase 2: React Native App — BLE Transport

- [ ] **U5. Add `react-native-ble-plx` and create BLE discovery hook**

**Goal:** Replace mDNS discovery with BLE scanning. New `useBLEDiscovery` hook scans for `FloydFeeder-*` devices.

**Dependencies:** U2 (ESP32 BLE server must exist for testing)

**Files:**

- Create: `hooks/useBLEDiscovery.ts`
- Create: `hooks/useBLEDiscovery.test.ts` (or manual testing notes)
- Modify: `package.json` (add `react-native-ble-plx`)

**Approach:**

- Install `react-native-ble-plx` (2.5k+ stars, best maintained RN BLE library)
- Create `useBLEDiscovery` hook:
  - `BleManager` instance (singleton, ref)
  - `startScan(serviceUUIDs: string[])` → scans for Floyd Feeder service UUID
  - `stopScan()`
  - Returns `{ devices: DiscoveredFeeder[], isScanning, error }`
  - `DiscoveredFeeder` type: `{ chipId: string, deviceName: string, rssi: number }`
- Parse chipId from device name: `FloydFeeder-XXXXXXXX` → extract hex ID
- Filter by service UUID in advertisement data (Android) or via service query (iOS)
- Handle permissions: Android requires `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION` (BLE scan requires location permission on Android ≤12)
- Add Android permissions to `android/app/src/main/AndroidManifest.xml`
- Add iOS usage description to `app.json` (`NSBluetoothAlwaysUsageDescription`)

**Patterns to follow:** Current `useMDNS.ts` — same discovery interface (`DiscoveredFeeder`, `isScanning`, `error`), different transport.

**Test scenarios:**

- Happy path: ESP32 advertising → `startScan()` → device list shows `FloydFeeder-{chipId}`
- Happy path: Multiple feeders nearby → all appear in device list with unique chipIds
- Edge case: ESP32 powers off during scan → device removed from list (platform-dependent)
- Error path: Bluetooth off → error message with guidance to enable Bluetooth
- Error path: Location permission denied (Android) → error message with guidance
- Integration: Hook cleanup on unmount stops scan and releases BleManager

**Verification:**

- Manual test: ESP32 powered on, app shows feeder in scan list
- Manual test: Tapping feeder connects (U6)

---

- [ ] **U6. Create BLE transport layer (useBLETransport)**

**Goal:** A hook that manages BLE connection, GATT characteristic reads/writes/notifications, and exposes a transport interface compatible with useESP32Context.

**Dependencies:** U5

**Files:**

- Create: `hooks/useBLETransport.ts`
- Modify: `hooks/useESP32Context.tsx` (later, U10)

**Approach:**

- `useBLETransport(chipId: string | null)` hook:
  - `connect(deviceId: string)` → BLE connect, discover services, subscribe to notify characteristics (Response, Telemetry, Status, Feed Log)
  - `disconnect()`
  - `sendCommand(action: string, parameters?: object)` → JSON stringify, write to Command characteristic
  - `readStatus()` → read Status characteristic
  - `readSchedules()` → read Schedules characteristic (handle chunked response)
  - `writeSchedules(schedules: Schedule[])` → JSON stringify, chunk if >480 bytes, write chunks sequentially
  - `writeConfig(config: FeederConfig)` → JSON stringify, write to Config characteristic
  - `syncTime()` → write 4-byte uint32 Unix timestamp to Time characteristic
  - `switchToAP()` → write `{action: "switch_mode", parameters: {mode: "ap"}}` to Command characteristic
  - `onMessage` callback (mirrors MQTT `onMessage`) — fired when Response/Telemetry/Status/FeedLog notify
  - State: `{ isConnected, isConnecting, error }`
- Handle BLE disconnection: attempt reconnection with exponential backoff (1s, 2s, 4s, max 30s, max 3 attempts, then give up)
- Handle GATT operation timeouts: 10s timeout, treat as disconnection
- MTU negotiation: request 512 bytes on connect (ESP32 NimBLE supports this)
- Handle chunked reads transparently — caller sees complete JSON, hook handles assembly

**Execution note:** Start with a single characteristic (Command) and test basic JSON round-trip before building out all 8.

**Patterns to follow:** Current `useMQTT.ts` — same state shape (`isConnected`, `isConnecting`, `error`), same `onMessage` callback pattern, same `connect`/`disconnect` lifecycle.

**Test scenarios:**

- Happy path: Connect → write Command → receive Response notification → onMessage fires
- Happy path: Telemetry notifications arrive at configured interval → onMessage fires with sensor_data
- Happy path: syncTime() → ESP32 clock updates (verify via Status read showing time_synced=true)
- Edge case: Chunked schedule write (4 schedules, 2KB) → ESP32 receives all chunks → schedules_list response confirms
- Edge case: BLE disconnect → auto-reconnect with backoff → reconnects within 10s
- Error path: GATT write timeout → error state → doesn't crash
- Error path: Invalid JSON response from ESP32 → logged, onMessage not called with garbage

**Verification:**

- Manual test: Connect via BLE, send start_feed, motor runs
- Manual test: Telemetry updates appear in app dashboard
- Manual test: Sync time → check ESP32 serial monitor for time update

---

- [ ] **U7. Add BLE time sync service in app**

**Goal:** Automatically push current time to ESP32 on every BLE connection.

**Dependencies:** U6

**Files:**

- Create: `hooks/useBLETimeSync.ts`
- Modify: `hooks/useESP32Context.tsx` (later, U10)

**Approach:**

- `useBLETimeSync(bleTransport)` hook:
  - On BLE connect event: call `bleTransport.syncTime(Date.now() / 1000)`
  - On app foreground: if connected, re-sync time
  - Optional: periodic re-sync every hour if connected (belt and suspenders)
- Simple — 4 bytes, one GATT write, fire and forget

**Test scenarios:**

- Happy path: App connects via BLE → time synced → ESP32 serial monitor shows updated time
- Happy path: App goes to background for 2 hours, returns to foreground → time re-synced
- Edge case: BLE disconnects during time sync write → no crash, retry on next connect

**Verification:**

- Manual test: Connect via BLE, check ESP32 serial for "Time synced: {timestamp}"

---

### Phase 3: React Native App — Dual-Transport Context

- [ ] **U8. Refactor `useESP32Context` for dual-transport architecture**

**Goal:** Context supports both BLE (primary, always-on) and MQTT (fallback, manual). Transparent transport switching for all screen consumers.

**Dependencies:** U6, U7

**Files:**

- Modify: `hooks/useESP32Context.tsx`
- Create: `hooks/types.ts` (shared transport types)

**Approach:**

- Define `TransportState` interface: `{ isConnected, isConnecting, error, connect, disconnect, sendCommand, onMessage }`
- `useBLETransport` and `useMQTT` both conform to this interface (adapter pattern)
- `useESP32Context` holds both transports, active transport is `"ble" | "mqtt"`
- Connection modes simplified to `"ble" | "direct-ap"` (remove `"auto"` / home WiFi)
- Auto-connect: on mount, if chipId known, start BLE discovery → connect
- Manual switch to Direct AP:
  1. Send BLE `switch_mode: "ap"` command
  2. Wait for BLE disconnect
  3. Connect phone to `FloydFeeder-{chipId}` WiFi (user must be in WiFi settings or we guide them)
  4. Actually — we can't programmatically switch WiFi on iOS. So Direct AP flow is: user taps "Connect via WiFi" → app shows instructions (connect to FloydFeeder-XXXX WiFi, then tap Connect) → app connects MQTT to 192.168.4.1:1883
  5. When user leaves Direct AP mode: send MQTT `switch_mode: "ble"`, disconnect MQTT, ESP32 auto-returns to BLE after timeout
- Publish command routes to active transport
- `onMessage` unified — both transports feed into the same `handleMessage` callback (identical JSON format)
- Remove all mDNS code (`useMDNS` import, `startScan` for mDNS, `discoveredFeeder` from mDNS)
- Remove `connectionMode` auto/direct-ap distinction — now it's just BLE with manual AP fallback
- Keep `publishScheduleSync` but route through active transport

**Patterns to follow:** Current `useESP32Context.tsx` structure. The change is replacing mDNS discovery with BLE discovery and making MQTT a fallback instead of co-primary.

**Test scenarios:**

- Happy path: App starts → BLE scan → discovers feeder → auto-connects → telemetry flows
- Happy path: User taps "Connect via WiFi" → app guides user to join FloydFeeder WiFi → MQTT connects → telemetry flows over MQTT
- Happy path: User disconnects WiFi mode → ESP32 returns to BLE → app reconnects via BLE
- Edge case: BLE connection lost → app shows "disconnected", retries with backoff
- Edge case: MQTT connection lost during WiFi mode → auto-return to BLE after timeout
- Integration: Schedule CRUD works over both BLE and MQTT
- Integration: Feed command works over both transports

**Verification:**

- All existing screens (Dashboard, Controls, Schedule, History) function over BLE
- All existing screens function over Direct AP (MQTT)
- Transport switching doesn't lose state (deviceData, schedules, feedLogs)

---

- [ ] **U9. Update `ESP32Connection` component for BLE-first UX**

**Goal:** Redesign the connection card for the new two-mode reality.

**Dependencies:** U8

**Files:**

- Modify: `components/ESP32Connection.tsx`

**Approach:**

- Remove mode toggle (Home WiFi / Direct AP selector) — only one active transport at a time
- New states:
  - **No feeder configured:** "Set Up Feeder" button → opens BLE scan screen
  - **BLE scanning:** Skeleton with scanning animation, device list
  - **BLE connecting:** Activity indicator, "Connecting to FloydFeeder-{id}..."
  - **BLE connected:** Green status, chipId, "Connected via Bluetooth", RSSI indicator, "Connect via WiFi" link
  - **BLE disconnected (error):** Error message, "Scan Again" button, "Connect via WiFi" fallback
  - **WiFi connecting:** Instructions card ("Go to Settings → WiFi → FloydFeeder-{id} → then tap Connect"), Connect button
  - **WiFi connected:** Green status, chipId, "Connected via Direct WiFi", "Disconnect" button (returns to BLE)
- Remove "Reconfigure" button (no more WiFi provisioning to reconfigure)
- Remove troubleshooting tips that reference Home WiFi / mDNS
- Add BLE signal strength indicator (RSSI from scan)
- Keep "Disconnect" and "Reconnect" for both modes

**Test scenarios:**

- Happy path: First launch → "Set Up Feeder" → BLE scan → tap feeder → connected
- Happy path: Connected via BLE → tap "Connect via WiFi" → instructions shown → user joins WiFi → taps Connect → MQTT connects
- Happy path: WiFi connected → tap Disconnect → returns to BLE scanning → auto-reconnects
- Edge case: BLE and WiFi both unavailable → clear error message with "both Bluetooth and WiFi must be enabled"

**Verification:**

- All connection states render correctly in light and dark themes
- Transitions between states are smooth (no flicker)
- No dead UI paths (every state has an action the user can take)

---

### Phase 4: Remove dead code and dependencies

- [ ] **U10. Remove provisioning, mDNS, and WebView**

**Goal:** Delete `provision.tsx`, `useMDNS.ts`, and related dead code. Uninstall unused dependencies.

**Dependencies:** U9 (new setup flow replaces provisioning)

**Files:**

- Delete: `app/provision.tsx`
- Delete: `hooks/useMDNS.ts`
- Modify: `app/_layout.tsx` (remove any provision route references — check if it's in the Stack)
- Modify: `package.json` (remove `react-native-zeroconf`, `react-native-webview`)

**Approach:**

- Verify `provision.tsx` is only referenced from:
  - `ESP32Connection.tsx` → `router.push("/provision")` (will be removed in U9)
  - `_layout.tsx` → check if there's a `Stack.Screen name="provision"` entry
- Verify `useMDNS.ts` is only imported by:
  - `useESP32Context.tsx` (will be removed in U8)
- Run `npm uninstall react-native-zeroconf react-native-webview`
- If `react-native-webview` is still used elsewhere (check), keep it — but from codebase review it's only used in `provision.tsx`
- Remove BLE permissions added in U5 from Android manifest if they overlap with existing (they won't — these are new)

**Test scenarios:**

- App compiles without zeroconf and webview imports
- `npm list react-native-zeroconf` → not found
- `npm list react-native-webview` → not found (or still present if used elsewhere)
- All screens render without crashing
- No broken imports or type errors

**Verification:**

- `npx expo start` succeeds
- `npx tsc --noEmit` passes

---

- [ ] **U11. Update documentation**

**Goal:** Reflect the new architecture in README, codebase.md, and ESP32 setup guide.

**Dependencies:** U10 (all implementation complete)

**Files:**

- Modify: `README.md`
- Modify: `codebase.md`
- Modify: `ESP32_Setup_Guide.md`

**Approach:**

- Update architecture diagram: remove Home WiFi path, add BLE path, show AP as fallback
- Update "Quick Start": replace WiFi provisioning steps with "Power on ESP32, open app, tap feeder in BLE list"
- Update Component table: remove WebView, zeroconf; add BLE
- Update ESP32 library table: remove WiFiManager, ezTime, ESPmDNS; add NimBLE
- Add BLE permissions note for Android
- Remove "Provisioning flow" section
- Update MQTT protocol section to note it's Direct AP fallback only

**Test scenarios:**

- New developer following README can get the app running without hitting dead instructions

**Verification:**

- README accurately describes the two-tap BLE setup
- Codebase diagram matches implementation

---

## System-Wide Impact

- **Interaction graph:** `useESP32Context` is the central hub. All screens (Dashboard, Controls, Schedule, History) consume it through `useESP32()`. Transport changes are transparent to screens — they call `publishCommand`, `requestSensorData`, `startFeed`, etc. regardless of active transport.
- **Error propagation:** BLE disconnection should surface the same "Feeder disconnected" state as MQTT disconnection. Error messages should indicate which transport failed (e.g., "Bluetooth connection lost" vs "WiFi connection lost").
- **State lifecycle:** `deviceData`, `feedLogs`, `schedules` survive transport switches — they live in React state + AsyncStorage, not in the transport.
- **API surface parity:** All `ESP32ContextType` methods (`startFeed`, `stopFeed`, `clearJam`, `requestSensorData`, `publishCommand`, `publishScheduleSync`) must work identically over both transports.
- **Integration coverage:** BLE→AP→BLE round-trip should be tested end-to-end. A schedule set over BLE should persist and fire correctly after an AP mode switch and return to BLE.

---

## Risks & Dependencies

| Risk                                                                           | Mitigation                                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-ble-plx` requires Expo dev client or bare workflow — not Expo Go | Document this. EAS Build already in use, so no impact. Add expo dev client if needed for local dev.                                         |
| BLE GATT throughput may be slow for schedule sync (4+ schedules, ~2KB)         | Chunking protocol handles this. Accept ~1-2s for full schedule sync.                                                                        |
| Android BLE permissions model changed in API 31+                               | Handle with runtime permission requests. `react-native-ble-plx` docs cover this.                                                            |
| ESP32 NimBLE and WiFi coexistence if both accidentally active                  | Mode switching (U3) prevents this. Only one radio mode at a time.                                                                           |
| NVS format change may corrupt existing schedules on firmware update            | Test migration: flash new firmware over old NVS. Schedules struct unchanged (WiFi creds removed from AppConfig, schedules in separate key). |
| iOS BLE background execution is limited                                        | App in foreground for BLE is fine. Background BLE is possible but not required for MVP (user is actively using the app).                    |

---

## Deferred to Follow-Up Work

- **BLE bonding / security (PIN pairing):** Deferred per decision #8. Add when user feedback indicates need.
- **BLE background mode:** iOS and Android support BLE background execution but with restrictions. Deferred until users request "background telemetry monitoring."
- **Multi-feeder support:** Currently single-feeder. BLE scan could show multiple feeders — deferred until hardware supports multiple units.
- **Cloud relay:** If remote access is ever needed, can be added as a separate transport alongside BLE and Direct AP.
- **Android WiFi P2P for "Connect via WiFi" without manual WiFi switch:** `react-native-wifi-p2p` is Android-only and unreliable. Deferred until platform support matures.
- **ESP-NOW for mesh:** If multiple feeders are needed, ESP-NOW can link them. Deferred.
