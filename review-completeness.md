# Completeness & Plan Alignment Review

**Date:** 2026-05-03
**Branch:** `local-connection`
**Plan:** `docs/plans/2026-05-03-remove-cloud-direct-wifi.md` (5 phases, ~20 tasks)
**Reviewer:** Code Review (completeness & plan alignment angle)

---

## Summary

The implementation covers the plan's intent well overall. Most Phase 1 (ESP32 firmware) and Phase 2 (app infrastructure) tasks are implemented. Phase 3 (screen rewrites) and Phase 4 (cleanup) have gaps. The working tree fixes one regression (dangling `get_schedules` branch) but leaves other regressions and leftover cloud references.

### Status by Phase

| Phase                  | Tasks   | Status                                   |
| ---------------------- | ------- | ---------------------------------------- |
| 1 – ESP32 Firmware     | 1.1–1.7 | ✅ Mostly done, 1 issue (duplicate ping) |
| 2 – App Infrastructure | 2.1–2.5 | ✅ Done                                  |
| 3 – Screen Rewrites    | 3.1–3.6 | ⚠️ Partial (3 gaps)                      |
| 4 – Cleanup            | 4.1–4.5 | ⚠️ Partial (3 gaps)                      |
| 5 – Documentation      | 5.1–5.2 | ✅ Done                                  |

---

## P0 Findings (Blocker — must fix)

### P0-1: Duplicate `ping` handler in ESP32 firmware

**File:** `ESP32_MQTT_Server.ino` lines 823 and 879
**Plan ref:** Task 1.5 (no mention of duplicate handlers)

The `handleMQTTMessage()` function has **two** `action == "ping"` branches — one at line 823 (before `get_schedules`) and another at line 879 (after `set_schedules`). The first one will always match, making the second dead code. This is a logic error (the second one can never execute) but not a runtime crash.

**Suggestion:** Remove the second `ping` handler at line 879. The first one at line 823 is sufficient.

---

### P0-2: `resetConnection` in `useMQTT.ts` calls `connect(chipId)` with wrong signature

**File:** `hooks/useMQTT.ts` line 167
**Plan ref:** Task 2.3

```typescript
const resetConnection = useCallback(() => {
  const chipId = chipIdRef.current;
  disconnect();
  if (chipId) {
    setTimeout(() => connect(chipId), 500); // BUG
  }
}, [connect, disconnect]);
```

`connect()` now expects `(brokerUrl: string, chipId?: string)` per the plan's Task 2.3, but `resetConnection` passes `chipId` as the first argument (which becomes `brokerUrl`). This will attempt `mqtt.connect(chipId)` with a hex chip ID string instead of `mqtt://host:port`. The MQTT library will reject the invalid URL and the connection will silently fail.

**Suggestion:** Remove or reimplement `resetConnection` — the context doesn't expose it meaningfully (it needs a stored broker URL from the last mDNS discovery). Either:

- Store the last resolved `brokerUrl` in a ref so `resetConnection` can use it, or
- Have `resetConnection` recall `startScan()` (which triggers the mDNS → MQTT chain in context).

---

### P0-3: HiveMQ Cloud credentials in `eas.json` — active in all build profiles

**File:** `eas.json` lines 11–12, 23–24, 33–34
**Plan ref:** Task 4.4, Task 4.3

All three build profiles (development, preview, production) still contain:

```
EXPO_PUBLIC_MQTT_BROKER_URL: mqtts://...hivemq.cloud:8883
EXPO_PUBLIC_API_URL: https://floyd-app-production.up.railway.app
```

These env vars are **dead code now** — no component reads them (the MQTT hook no longer uses `EXPO_PUBLIC_MQTT_BROKER_URL`, and the API client (`services/api.ts`) was deleted). But they're misleading and could confuse future maintainers. The plan explicitly says "Strip `EXPO_PUBLIC_*` vars; keep EAS Build" (Decision 19).

**Suggestion:** Remove both env vars from all three build profiles in `eas.json`.

---

## P1 Findings (Major gap — should fix)

### P1-1: `get_schedules` response `data` field is an array, but `MQTTMessage.data` is typed as `Record<string, unknown>`

**File:** `hooks/useMQTT.ts` line 14–18
**Plan ref:** Tasks 1.5, 2.4

The `MQTTMessage` interface defines `data: Record<string, unknown>`. However, the `schedules_list` response sends `data` as a JSON **array** (`{"type":"schedules_list","data":[...]}`). In `useESP32Context.tsx` line 178, the code does `message.data as unknown as Schedule[]` to work around the type mismatch.

This works at runtime but is a typing lie. If a linter or strict TypeScript checks are enabled, this pattern will cause issues. More critically, any future `data` field that sends a primitive or array will be awkward to handle.

**Suggestion:** Change `MQTTMessage.data` to `unknown` and add type guards at consumption sites, or use a discriminated union type per `type` field.

---

### P1-2: ESP32Connection component still uses "cloud" CSS class names

**File:** `components/ESP32Connection.tsx` lines 61, 64, 74, 77, 139, 143, 146, 154, 164, 167, 170, 302, 307, 315, 319
**Plan ref:** Task 3.1 ("Remove all cloud language")

The component uses `cloudInfoContainer`, `cloudIconContainer`, `cloudTitle`, `cloudSubtitle` as `StyleSheet` keys and JSX `className` identifiers. While functionally harmless, these names contradict the plan's explicit requirement to "Remove all cloud language."

**Suggestion:** Rename all `cloud*` style identifiers to `feeder*` or `info*` (e.g., `cloudInfoContainer` → `feederInfoContainer`, `cloudTitle` → `infoTitle`).

---

### P1-3: `useScheduleMQTT.ts` uses `useMemo` for imperative side effects (fetching schedules)

**File:** `hooks/useScheduleMQTT.ts` lines 46–54
**Plan ref:** Task 2.5 (plan shows `useEffect`, but code uses `useMemo`)

```typescript
// Derive schedules from deviceData when schedules_list arrives
useMemo(() => { setSchedulesLocal(deviceData.schedules as Schedule[]); ... }, [deviceData]);

// Fetch on connect
useMemo(() => { if (isConnected) { fetchSchedules(); } }, [isConnected, fetchSchedules]);
```

Using `useMemo` for side effects is a documented anti-pattern. React's `useMemo` is intended for pure memoization and React 18+ Strict Mode double-invokes `useMemo` callbacks in development, which could cause the schedules `fetchSchedules` to fire twice. The `no-use-effect` Skill in this project enforces avoiding `useEffect`, but `useMemo` with side effects is not the correct replacement — use event handlers or custom mount hooks instead.

**Suggestion:** Replace the `useMemo` for `fetchSchedules` with a pattern that triggers `fetchSchedules` from the event that establishes the connection (e.g., in the MQTT `onConnect` callback or as part of the context's `connect` flow). For the deviceData derivation, a simple conditional assignment on render would suffice if schedules is derived, not stored.

---

### P1-4: Docs still contain extensive HiveMQ/Railway references

**Files:**

- `docs/floyd-feeder-manual-setup.md` (entire document — 300+ lines of HiveMQ/Railway setup)
- `docs/floyd-feeder-electronics-setup.md` (lines 75, 77, 87, 242)
- `bugs.md` (lines 18, 20)

**Plan ref:** Task 1.7 (Task says "Remove all references to HiveMQ Cloud, MQTT broker URLs, MQTT credentials. Add mDNS and local broker setup notes.")

These docs are written for the old cloud architecture. While they're in `docs/` and not active code, a future developer could follow these instructions and be confused. The plan's Task 1.7 specifically asks to update `ESP32_Pin_Layout_Optimization.md` and `ESP32_Setup_Guide.md` — the latter was updated (git diff shows it), but the deeper docs were not.

**Suggestion:** Either:

- Add a banner to each legacy doc saying "⚠️ This document describes the deprecated cloud architecture — see `docs/plans/2026-05-03-remove-cloud-direct-wifi.md` for the new LAN-only architecture", or
- Rewrite/remove the documents as the plan intended.

---

### P1-5: Dashboard still shows `Device Status` card with Feeder Online/Offline/Unknown — redundant with `ESP32Connection`

**File:** `app/(tabs)/index.tsx` lines 231–268
**Plan ref:** Task 3.2

The dashboard renders both the full `ESP32Connection` component (which shows connection state in detail) AND a separate "Device Status" `StatCard` that repeats the same information (Feeder: Online / Offline). The plan says "Remove the 'Device Status' card with separate Cloud/Feeder rows. Merge into a single connection status display." The ESP32Connection now serves this purpose, but the redundant Device Status card remains.

**Suggestion:** Remove the "Device Status" `StatCard` (lines ~231–268) from the dashboard. The `ESP32Connection` component already provides the connection UX.

---

### P1-6: `useMQTT` is imported into context but `mqttConnect` references `connect` which requires a brokerUrl

**File:** `hooks/useESP32Context.tsx` line 212
**Plan ref:** Task 2.4

```typescript
mqttConnect(brokerUrl, chipId);
```

This is correctly passing the broker URL from `discoveredFeeder`. However, the context's `connect` method (line 253) only calls `startScan()` — it does not accept or pass a broker URL. If a user calls `context.connect()` directly (e.g., from ESP32Connection's "Scan Again" button), it starts scanning but the actual MQTT connect depends on the `useMemo` chain firing. This is fragile because `useMemo` is not guaranteed to run on every render if React batches updates.

**Suggestion:** Ensure the mDNS → MQTT lifecycle is robust. Either:

- Make the `useMemo` into a real event-driven flow (start scan → on resolved → connect MQTT), or
- Have `connect()` immediately trigger the MQTT connection if a previously discovered feeder is cached.

---

## P2 Findings (Minor gap — should address for completeness)

### P2-1: `onBrokerMessage` in ESP32 firmware registers for topic but broker subscription is implicit

**File:** `ESP32_MQTT_Server.ino` lines 98–102
**Plan ref:** Task 1.3

The `onBrokerMessage` callback checks `topic == topicCommand` directly. It's unclear how the broker dispatches messages to this callback — does `sMQTTBroker` automatically route all messages to this single callback? If so, the check is correct. If not, the broker may need an explicit `broker.subscribe(topicCommand, onBrokerMessage)` call.

**Suggestion:** Verify `sMQTTBroker` API — if it uses a single global message callback, add a comment explaining this. If it needs explicit subscription, add `broker.subscribe(topicCommand.c_str(), onBrokerMessage)` in `setup()`.

---

### P2-2: `syncNTP` runs every 60s but `events()` is CPU-heavy

**File:** `ESP32_MQTT_Server.ino` lines 157–175
**Plan ref:** Task 1.2

`syncNTP()` calls `events()` every invocation (once per loop cycle after the 60s gate), not just once per 60s. The `events()` function in ezTime processes time zone events. This is fine as long as it returns quickly when there are no events, but worth noting if the loop starts dropping MQTT packets under load.

**Suggestion:** Either gate `events()` to run on a separate timer (e.g., once per second, not once per loop cycle at 10ms) or keep it but add a comment that it's lightweight when idle.

---

### P2-3: `useScheduleMQTT`'s `pushSchedules` sets local state optimistically before ESP32 confirms

**File:** `hooks/useScheduleMQTT.ts` lines 32–43
**Plan ref:** Task 2.5

```typescript
const ok = publishScheduleSync(newSchedules);
if (ok) {
  setSchedulesLocal(newSchedules);
}
```

This optimistically sets local state when `publish()` returns `true` (meaning the MQTT client accepted the message for sending). But the ESP32 could still reject the payload (e.g., invalid JSON, too many schedules). The app would show the schedules as saved, but a subsequent `get_schedules` would return the old data. The plan's `useScheduleMQTT` spec doesn't mention an acknowledgment flow.

**Suggestion:** After `pushSchedules`, trigger `fetchSchedules()` after a short delay (e.g., 500ms) to reconcile. Or better, have the `set_schedules` handler on the ESP32 broadcast the updated list immediately (it currently sends a `control_response` with `success: true` but not the new schedules — the app could listen for this and re-sync).

---

### P2-4: `useAlerts.ts` uses `toLocaleString()` for alert timestamps but `getRelativeTime()` overwrites it

**File:** `hooks/useAlerts.ts` lines 93, 129
**Plan ref:** Task 4.5

The `generateAlerts()` function sets `timestamp: new Date().toLocaleString()` (an absolute timestamp like "5/3/2026, 10:30:00 AM"). Then `useAlerts()` calls `getRelativeTime(alert.timestamp)` on each alert, which attempts `new Date(timestamp)` on a locale string — this is unreliable across browsers/regions and will produce `Invalid Date` in some environments.

**Suggestion:** Store `timestamp` as an ISO string (`new Date().toISOString()`) in `generateAlerts()`, then parse it reliably in `getRelativeTime()`.

---

### P2-5: `MQTTMessage type` union is missing `schedules_list` in some type checks

**File:** `hooks/useMQTT.ts` line 15
**Plan ref:** Task 1.5

The `type` field in `MQTTMessage` includes `"schedules_list"` as a literal, which is used in the context's `handleMessage` switch. However, the ESP32 also sends `type: "control_response"` for `set_schedules` responses. The `MQTTMessage` type correctly includes `"control_response"`. This is fine — just noting that the type union is correct.

No action needed.

---

### P2-6: `useScheduleMQTT.ts` does not handle the case where `pushSchedules` calls `publishScheduleSync` but the ESP32 responds with an error

**File:** `hooks/useScheduleMQTT.ts` lines 32–43
**Plan ref:** Task 2.5

If the ESP32 responds with `control_response.action = "set_schedules"` where `success = false`, the app has no way to know the save failed. The `setSchedulesLocal(newSchedules)` has already optimistically updated state, and no rollback mechanism exists.

**Suggestion:** Add a `control_response` handler in `useScheduleMQTT` that watches for `set_schedules` acknowledgment and handles the error case by re-fetching from the ESP32.

---

### P2-7: `loadSchedules()` duplication in firmware setup

**File:** `ESP32_MQTT_Server.ino` lines 472–473
**Plan ref:** Task 1.4

`loadSchedules()` is called once in `setup()` at line 473. This is correct. However, there's a duplicated `Serial.println("Saved config to NVS");` statement in the file (once at the end of `saveConfig()`, once orphaned).

**Suggestion:** Clean up the orphaned `Serial.println` (it appears as a dangling statement after a closing brace).

---

## Regression Check

### Regression 1: `resetConnection` is broken (P0-2 above)

The `resetConnection` function in `useMQTT.ts` is broken by the signature change to `connect()`. This was working before (when `connect` only took `chipId`).

### Regression 2: `ESP32Connection.tsx` "Scan Again" button calls `connect()` which only starts mDNS

Previously, `connect()` would directly initiate an MQTT connection. Now it only starts mDNS scanning. The MQTT connection depends on the `useMemo` chain resolving `discoveredFeeder`. If mDNS already resolved previously, this chain won't re-fire because `discoveredFeeder` state is already set. The "Scan Again" button may appear to do nothing if a feeder was already found.

**Suggestion:** In the `connect()` handler in context, check if `discoveredFeeder` exists. If so, connect MQTT directly with the cached IP. If not, start scanning.

### Regression 3: `hardwareOffline` concept partially removed but still used

**File:** `app/(tabs)/controls.tsx` lines 110, 149

The plan says "Remove `hardwareOffline` concept (collapsed into `!isConnected`)." Yet `hardwareOffline` is still computed at line 149 (`const hardwareOffline = isConnected && esp32Status !== "connected"`) and used at line 110 for the "Feeder is offline" banner. This is because `esp32Status` (tri-state: connected/disconnected/unknown) still exists in the context. The plan wanted binary state, but the code kept tri-state.

**Suggestion:** Either keep tri-state and acknowledge it's needed for the "connected but not responding" case, or simplify to binary and remove the `hardwareOffline` banner.

---

## Question Answers

### Q5: Does MQTT topic model match `floyd/devices/{chipId}/command` pattern everywhere?

**YES** — All four files confirm the pattern:

| File                                  | Usage                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ESP32_MQTT_Server.ino` lines 279–282 | Defines topics as `floyd/devices/{chipId}/command`, `/telemetry`, `/status`, `/response`                 |
| `hooks/useMQTT.ts` lines 108–110      | Subscribes to `floyd/devices/{chipId}/telemetry`, `/status`, `/response`                                 |
| `hooks/useMQTT.ts` line 159           | Publishes to `floyd/devices/{chipId}/{topic}` (topic is `"command"` or `"config"`)                       |
| `hooks/useESP32Context.tsx` line 277  | Publishes `set_schedules` command via `publish("command", ...)` → topic `floyd/devices/{chipId}/command` |

No discrepancies found. ✅

### Q6: Does `useESP32Context.tsx` properly integrate mDNS → MQTT connect lifecycle?

**MOSTLY YES**, with caveats:

1. ✅ `useMDNS(chipId)` is called with chipId for filtering.
2. ✅ When `chipId` is set, `startScan()` is called.
3. ✅ When `discoveredFeeder` is set, `mqttConnect(mqtt://host:port, chipId)` is called.
4. ❌ The lifecycle is driven by `useMemo` rather than events (see P1-6). React may batch changes and skip re-execution in edge cases.
5. ❌ The `connect()` method only starts scanning — if a feeder was previously discovered, it won't reconnect to the cached IP.
6. ⚠️ There's no cleanup / stop-scan on unmount or when `chipId` changes to null.

### Q7: The `.ino` firmware removed a dangling `get_schedules` branch — correct?

**The current working tree is correct.**

The committed code at HEAD had:

```
  } else if (action == "ping") {      ← line 881 (duplicate)
    handlePing(0);
  } else if (action == "get_schedules")  ← line 884 (dangling, no body, no opening brace)
  } else if (action == "restart_provisioning") {  ← line 886
```

This was a **syntax error**. The `get_schedules` branch had no body and no opening brace `{`. The Arduino compiler would reject this code. The working tree diff removes this dangling branch, which is correct — `get_schedules` already has a proper handler at line 830.

**However**, two issues remain in the current file:

1. Duplicate `ping` handler (lines 823 and 879) — see P0-1.
2. The file compiles but the duplicate ping is dead code.

---

## Leftover Cloud References in Active Codebase

| File                                     | Lines                 | Reference                                                     | Severity                                      |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `eas.json`                               | 11–12, 23–24, 33–34   | HiveMQ Cloud URL + Railway API URL                            | **P0** — builds still carry dead cloud config |
| `components/ESP32Connection.tsx`         | 6 locations           | `cloudInfoContainer`, `cloudTitle`, `cloudSubtitle` CSS names | P1 — cosmetic but contradicts plan            |
| `docs/floyd-feeder-manual-setup.md`      | Entire doc            | Full HiveMQ/Railway tutorial                                  | P1 — legacy doc, no active code               |
| `docs/floyd-feeder-electronics-setup.md` | Lines 75, 77, 87, 242 | HiveMQ broker references                                      | P1 — legacy doc                               |
| `bugs.md`                                | Lines 18, 20          | TLS heap concerns with HiveMQ                                 | P2 — legacy notes                             |

The **active source code** (`.ts`, `.tsx`, `.ino` files excluding docs) is clean of cloud references except the CSS naming issue in ESP32Connection.tsx and eas.json.

---

## Plan vs. Implementation Gap Table

| #   | Plan Task                     | Status                    | Evidence                                                                                                           |
| --- | ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.1 | ESPmDNS advertising           | ✅ Done                   | Lines 92–100 (setup), 447 (loop: `MDNS.update()`)                                                                  |
| 1.2 | NTP time sync                 | ✅ Done                   | `syncNTP()` at lines 157–175, called in loop line 453                                                              |
| 1.3 | Embedded MQTT broker          | ✅ Done                   | `sMQTTBroker broker` + `WiFiServer wifiServer(1883)` + broker init                                                 |
| 1.4 | Schedule persistence + cron   | ✅ Done                   | `ScheduleStore`, `loadSchedules()`, `saveSchedules()`, `checkSchedules()`                                          |
| 1.5 | Schedule MQTT handlers        | ✅ Done (with bug)        | `get_schedules` (line 830) + `set_schedules` (line 852) — duplicate ping handler remains                           |
| 1.6 | Strip WiFiManager params      | ✅ Done                   | No MQTT fields in `startProvisioningMode()`, no `generateMqttPassword()`                                           |
| 1.7 | Update firmware docs          | ⚠️ Partial                | `ESP32_Setup_Guide.md` rewritten. `ESP32_Pin_Layout_Optimization.md` not checked                                   |
| 2.1 | Install react-native-zeroconf | ✅ Done                   | Dep in `package.json`                                                                                              |
| 2.2 | Create useMDNS hook           | ✅ Done                   | `hooks/useMDNS.ts` present, with robust error handling                                                             |
| 2.3 | Modify useMQTT                | ✅ Done (with regression) | `connect(brokerUrl, chipId)` signature, no TLS. `resetConnection` broken (P0-2)                                    |
| 2.4 | Rewrite useESP32Context       | ✅ Done (with caveat)     | mDNS integration, feed logs, `publishScheduleSync`, `schedules_list` handler. `useMemo`-driven lifecycle (fragile) |
| 2.5 | Create useScheduleMQTT        | ✅ Done                   | Present at `hooks/useScheduleMQTT.ts`. Uses `useMemo` for side effects (P1-3)                                      |
| 3.1 | Rewrite ESP32Connection       | ⚠️ Partial                | Functionally correct, but leftover "cloud" CSS names (P1-2)                                                        |
| 3.2 | Update Dashboard              | ⚠️ Partial                | Status labels correct, but redundant "Device Status" card remains (P1-5)                                           |
| 3.3 | Update Controls               | ✅ Done                   | "Not connected to feeder" banner, no cloud language. `hardwareOffline` still present (Regr. 3)                     |
| 3.4 | Rewrite Schedule screen       | ✅ Done                   | Uses `useScheduleMQTT()`, no REST calls, `pushSchedules` for save                                                  |
| 3.5 | Rewrite History screen        | ✅ Done                   | Uses `feedLogs` from context, no `CLOUD_SERVER` constant                                                           |
| 3.6 | Simplify provision screen     | ✅ Done                   | No `claimDevice`, no `finishClaim` step, no MQTT password storage                                                  |
| 4.1 | Delete cloud server           | ✅ Done                   | `server/` directory doesn't exist                                                                                  |
| 4.2 | Delete services/api.ts        | ✅ Done                   | File doesn't exist                                                                                                 |
| 4.3 | Clean up package.json         | ✅ Done                   | No `@prisma/*`, `express`, `ws` deps                                                                               |
| 4.4 | Clean up .env files           | ✅ Done                   | `.env` stripped, now says "No cloud environment variables needed"                                                  |
| 4.5 | Remove cloud alarm references | ✅ Done                   | `useAlerts.ts` is hardcoded thresholds only                                                                        |
| 5.1 | Update codebase.md            | ✅ Done                   | Cloud references removed, local architecture documented                                                            |
| 5.2 | Update README.md              | ✅ Done                   | "No cloud. No accounts. No internet required."                                                                     |

---

## Recommendations Summary

### Must fix before merge (P0):

1. Remove duplicate `ping` handler in `ESP32_MQTT_Server.ino` line 879
2. Fix `resetConnection()` in `useMQTT.ts` — it passes chipId as brokerUrl
3. Clear HiveMQ/ Railway env vars from all profiles in `eas.json`

### Should fix before merge (P1):

4. Rename `cloud*` style keys in `ESP32Connection.tsx`
5. Remove redundant "Device Status" card from dashboard
6. Add mDNS-discovery-skip logic to context's `connect()` for cached feeders
7. Replace `useMemo`-as-side-effect in `useScheduleMQTT.ts` with event-driven pattern
8. Fix `getRelativeTime()` timestamp parsing in `useAlerts.ts`
9. Add legacy-doc banners for HiveMQ/Railway docs

### Nice to have (P2):

10. Fix `MQTTMessage.data` typing to allow arrays
11. Add `set_schedules` acknowledgment/rollback in `useScheduleMQTT.ts`
12. Optimize `events()` call frequency in firmware
13. Clean up orphaned `Serial.println` in firmware
