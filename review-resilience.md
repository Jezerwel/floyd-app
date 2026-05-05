# Resilience & Error Handling Review: Floyd Feeder (local-connection)

**Review date:** 2026-05-03
**Scope:** Error handling, resilience, race conditions, edge cases
**Files examined:** `useMDNS.ts`, `useMQTT.ts`, `useESP32Context.tsx`, `useScheduleMQTT.ts`, `app/provision.tsx`, `app/(tabs)/history.tsx`, `app/(tabs)/schedule.tsx`, `app/_layout.tsx`, `components/ESP32Connection.tsx`, `app/(tabs)/index.tsx`, `useAlerts.ts`, `useMountEffect.ts`, `ErrorToast.tsx`

---

## P0 — Critical / Blocker

### 1. `useMQTT` `connect()` is not idempotent — race on rapid re‑calls (useMQTT.ts:56-61)

```ts
if (clientRef.current) {
  clientRef.current.end(true);
  clientRef.current = null;
}
```

When `connect()` is invoked while a *previous* `connect()` call's asynchronous handshake is still in-flight, the old client is ended but the new `mqtt.connect()` returns a new client with overlapping event listeners. If the old client fires `on('connect', ...)` after the new one has started, it will set `isConnected=true` on the stale client, and the new client's `on('connect', ...)` also fires. This creates phantom connections, multiple subscriptions, and erratic `isConnected` / `isConnecting` toggling.

**Trigger:** UseMemo in `useESP32Context.tsx` can fire `mqttConnect` when `discoveredFeeder` or `chipId` reference changes. If mDNS re-discovers the same feeder, or if `chipId` reference changes while scan is running, `connect()` is called twice.

**Fix:** Guard with a `connectingRef` flag:

```ts
const connectingRef = useRef(false);
// In connect():
if (connectingRef.current) {
  // Optionally queue or just skip
  return;
}
connectingRef.current = true;
client.on('connect', () => {
  connectingRef.current = false;
  // ...
});
client.on('close', () => {
  connectingRef.current = false;
});
```

### 2. `useESP32Context.tsx:150-160` — `useMemo` drives MQTT connection as side effect

```ts
useMemo(() => {
  if (discoveredFeeder && chipId) {
    const brokerUrl = `mqtt://${discoveredFeeder.host}:${discoveredFeeder.port}`;
    mqttConnect(brokerUrl, chipId);
  }
  return undefined;
}, [discoveredFeeder, chipId, mqttConnect]);
```

`useMemo` has no guarantee about execution timing or number of invocations in concurrent mode (React 18+). React may call it speculatively and discard the result. This is an explicit React anti-pattern — side effects belong in event handlers or effects, not `useMemo`.

**Fix:** Replace with `useMountEffect` from your own hook, or use a key-based pattern (remount a child component that calls `useMountEffect`). At minimum, a callback ref approach:

```tsx
const mqttStartedRef = useRef(false);
if (discoveredFeeder && chipId && !mqttStartedRef.current) {
  mqttStartedRef.current = true;
  mqttConnect(...);
}
```

### 3. `useMQTT` stuck in `isConnecting` forever if first connection attempt never resolves (useMQTT.ts:73-92)

If `mqtt.connect()` fails silently (DNS resolution fails, TCP connection hangs, MQTT CONNACK never arrives), the `connectTimeout: 10000` fires an error, but the `on('error', ...)` callback only sets `isConnecting: false` for *that specific client*. If the user called `connect()` twice (see P0#1 above), the error from client A does nothing for client B, and client B's `on('connect', ...)` may never fire, leaving `isConnecting=true` permanently.

Additionally, `reconnectPeriod: 3000` means if the initial connection fails, MQTT.js auto-reconnects indefinitely, cycling through `on('reconnect', ...)` which sets `isConnecting=true` again. Auto-reconnect *with no max retry backstop* means the UI shows "Connecting..." forever even though the device may be offline permanently.

**Fix:**
- Add a max-reconnect counter in the hook and emit a terminal error after N attempts.
- Add a separate timeout (e.g. 30s) that sets `isConnecting=false` if no connect event fired, regardless of reconnect attempts.

### 4. `provision.tsx` — provision screen has no timeout for missing ESP32 AP (provision.tsx:105-110)

```tsx
<WebView
  source={{ uri: ESP_AP_URL }}
  onError={handleWebViewError}
/>
```

If the user is not connected to the `FloydFeeder` WiFi network, the WebView simply shows a blank white screen (or native error) for an indeterminate amount of time. `onError` only fires on WebView-level errors (e.g. SSL, bad URL), not on "could not reach host" (which is a navigation failure, not a render error). On Android, the WebView may show a native error page; on iOS, it may just hang.

**Fix:**
- Inject a connectivity probe timer that checks `fetch('http://192.168.4.1/ping')` and reports failure after 5s.
- Show a prominent "Can't find FloydFeeder WiFi?" state before the WebView loads.
- Add a timeout (e.g. `setTimeout` -> `setStep("error")`) cleared on first message from WebView.

### 5. `useESP32Context.tsx:160` — AsyncStorage write inside `setState` updater can cause stale closure and reentrancy

```tsx
setFeedLogsState((prev) => {
  const next = [newEntry, ...prev].slice(0, 100);
  AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(next)).catch(console.error);
  return next;
});
```

Putting `AsyncStorage.setItem` (an async, unthrottled I/O op) inside a `setState` updater violates the principle that updaters should be pure. If `feed_complete` messages arrive in rapid succession (e.g., burst of three), three `setItem` calls can race:
1. updater A reads `prev`, writes `nextA` → AsyncStorage(setItem A)
2. updater B reads `prev` (same as A's prev, because React batches) → writes `nextB` → AsyncStorage(setItem B)
3. setItem A resolves, setItem B resolves → whichever finishes last wins, losing data from the other

**Fix:** Use a `useRef` journal + debounced flush:

```tsx
const feedLogJournal = useRef<FeedLogEntry[]>([]);
// In callback:
feedLogJournal.current = [newEntry, ...feedLogJournal.current].slice(0, 100);
setFeedLogsState(feedLogJournal.current);
// Then debounce AsyncStorage write
```

Or use `useReducer` where the reducer is pure and the side effect is in a separate `useEffect` watching the reducer state.

---

## P1 — Major Gaps

### 6. `useMQTT.ts:114-123` — `onMessage` callback can throw, crashing the message handler

```ts
client.on("message", (_topic, payload) => {
  try {
    const parsed = JSON.parse(payload.toString()) as MQTTMessage;
    setState((prev) => ({ ...prev, lastMessage: parsed, error: null }));
    onMessageRef.current?.(parsed);
  } catch (error) {
    console.error("Failed to parse MQTT message:", error);
  }
});
```

`JSON.parse` is caught, but `onMessageRef.current?.(parsed)` is **not** inside the try block — React setState from `handleMessage` in `useESP32Context.tsx` could throw (e.g., in dev mode strict effects). If `handleMessage` throws, the MQTT client's internal message callback is unhandled, and subsequent messages may be dropped depending on the MQTT.js client's behavior.

**Fix:** Wrap the entire handler body in try/catch, or wrap the call to `onMessageRef.current`:

```ts
try {
  onMessageRef.current?.(parsed);
} catch (err) {
  console.error("MQTT message handler threw:", err);
}
```

### 7. `useMQTT.ts:25-28` — Global monkey-patch of `process.nextTick` may conflict with other modules

```ts
const globalScope = globalThis as GlobalWithProcess;
globalScope.process = globalScope.process ?? {};
globalScope.process.nextTick = globalScope.process.nextTick ?? ((callback) => setTimeout(callback, 0));
```

This runs at module import time and mutates the global `process` object. If another module (or React Native's own internals) provides `process.nextTick` later, this polyfill shadows it. Worse: if React Native's JS engine has already defined `process` but without `nextTick`, and another library depends on the native `process.nextTick` implementation, this `setTimeout`-based fallback can cause subtle timing bugs (microtask vs macrotask ordering).

**Fix:** Use a local polyfill scoped to the MQTT module, or configure MQTT.js's internal `nextTick` via its options instead of patching `globalThis`.

### 8. `useMQTT.ts:84` — MQTT subscriptions are never unsubscribed on disconnect/reconnect

```ts
client.subscribe(`floyd/devices/${chipId}/telemetry`, { qos: 0 });
client.subscribe(`floyd/devices/${chipId}/status`, { qos: 0 });
client.subscribe(`floyd/devices/${chipId}/response`, { qos: 0 });
```

On `disconnect()` → `client.end(true)` → reconnect with new client, subscriptions are re-created. But if `chipId` changes while connected, the old subscriptions (for the old chipId) are never explicitly unsubscribed before the client is destroyed. The broker accumulates stale subscriptions until client session expires (clean: true mitigates this, but only on clean disconnect).

**Fix:** Before `client.end(true)`, explicitly unsubscribe old topics if present. Minor issue with `clean:true` but still best practice.

### 9. `useESP32Context.tsx:203-205` — `startFeed`, `stopFeed`, `clearJam` silently no-op when disconnected

```ts
const startFeed = useCallback((params: FeedParams) => {
  if (!isConnected) return;
  publishCommand("start_feed", params);
}, [isConnected, publishCommand]);
```

Returning `void` (undefined) when not connected gives the caller no indication that the command was dropped. The UI may show optimistic state while the command never reached the device.

**Fix:** Return a result object `{ sent: boolean, reason?: string }` so callers can show feedback:

```ts
const startFeed = useCallback((params: FeedParams): { sent: boolean; reason?: string } => {
  if (!isConnected) return { sent: false, reason: "Not connected to feeder" };
  return { sent: publishCommand("start_feed", params) };
}, [isConnected, publishCommand]);
```

### 10. `useScheduleMQTT.ts:29-33` — `pushSchedules` optimistically updates local state even if MQTT publish fails

```ts
const ok = publishScheduleSync(newSchedules);
if (ok) {
  setSchedulesLocal(newSchedules);
}
```

`publishScheduleSync` calls `publish("command", ...)` which returns `false` only if `clientRef.current?.connected` is falsy. But MQTT.js's `publish()` itself returns `void` — there is **no acknowledgement that the device received the command**. Publishing with `qos: 0` means fire-and-forget: if the broker or device is momentarily unreachable, the publish silently succeeds from the app's perspective but the device never gets the update. The UI shows the new schedule, but the feeder still runs the old one.

**Fix:**
- Use `qos: 1` or 2 for schedule sync so the app gets an ack.
- After publishing, call `fetchSchedules()` with a timeout. If no `schedules_list` response arrives within 5s, revert the optimistic update.
- Track a `pendingSync` flag and show a warning "Schedule may not have been saved to device."

### 11. `useScheduleMQTT.ts:42-48` — `fetchSchedules` calls `publishCommand("get_schedules")` but no response timeout

```ts
const fetchSchedules = useCallback(() => {
  if (!isConnected) return;
  setLoading(true);
  publishCommand("get_schedules");
}, [isConnected, publishCommand]);
```

If the device doesn't respond (offline, crashed, MQTT message lost), `loading` stays `true` forever. The `onRefresh` callback in `schedule.tsx:81-85` sets `refreshing=false` immediately after calling `fetchSchedules()`:

```ts
const onRefresh = useCallback(() => {
  setRefreshing(true);
  fetchSchedules();
  setRefreshing(false);
}, [fetchSchedules]);
```

So the UI refreshes optimistically even if the fetch never completed, but `loading` (from `useScheduleMQTT`) stays `true`, causing the spinner in `schedule.tsx` line 174 to remain visible after pull-to-refresh finishes.

**Fix:** Add a timeout inside `fetchSchedules` (or in the hook state) that resets `loading` after e.g. 10s. Also, don't set `refreshing=false` synchronously — wait for a response or timeout.

### 12. `useESP32Context.tsx:112-113` — mDNS scan starts but stop is never exposed or called on timeout

```ts
useMemo(() => {
  if (chipId) {
    startScan();
  }
  return undefined;
}, [chipId, startScan]);
```

`useMDNS.ts` starts a Zeroconf scan but has no built-in timeout. Zeroconf will scan until `stop()` is called. If no device is found, `isScanning` remains `true` forever. The UI in `ESP32Connection.tsx` will show "Searching..." / "Looking for Floyd Feeder..." indefinitely.

**Fix:** Add a timeout parameter to `useMDNS`, or let the caller pass a timeout. If no service is resolved within (e.g.) 15s, automatically stop the scan and set `error: "No feeder found on network"`.

### 13. `app/(tabs)/history.tsx:54-79` — `useEffect` for sensor logging violates `no-use-effect` rule and has stale closure on `deviceData`

The `useEffect` dependency array includes individual `deviceData` properties (temperature, distance, etc.) but accesses them through `deviceData` which is a closure variable. Every time `deviceData` changes (even unrelated fields), a new effect closure is created, even if the specific sensor values didn't change. This creates unnecessary log entries and re-renders.

Additionally, the comment says "optimized to prevent excessive re-renders" but the effect runs on every `deviceData.temperature` change etc., and creates a log entry whenever `lastUpdate` changes. If two updates arrive within the same React batch, only one entry is created (good), but if they arrive milliseconds apart (common with MQTT bursts), many entries are created.

**Fix:** 
- Move sensor logging into the `handleMessage` callback in `useESP32Context.tsx` where it naturally sees every `sensor_data` message exactly once.
- Or use `useSyncExternalStore` / `useRef` based approach to avoid `useEffect`.

### 14. `provision.tsx:33-72` — `injectedJavaScript` runs `setInterval(scan, 1000)` indefinitely

The interval runs even after provisioning is completed or errored. Since the WebView is still mounted, the interval keeps polling the DOM and posting messages. This is a CPU/memory leak and may cause spurious `device-info-found`/`provisioning-complete` messages after the user has moved on.

**Fix:** Have the injected JS stop its interval when it detects `provisioning-complete`. Or clean up by reloading the WebView with a blank page after step changes away from "provisioning". Or use a `ref` to signal the interval to stop.

### 15. `app/_layout.tsx:22-29` — `useMountEffect` for `SplashHider` runs unconditionally

`SplashHider` is rendered inside `RootLayout`, which only renders once (no re-mounts in typical Expo Router usage), so this is harmless today. But if React StrictMode double-mounts in dev, `SplashScreen.hideAsync()` is called twice, which is benign. Not a blocker, but worth noting that the pattern exists alongside the `useEffect` rule.

---

## P2 — Minor / Quality

### 16. `useMDNS.ts:30-32` — Bare `catch {}` in `stopScan` swallows all errors

```ts
try {
  zeroconfRef.current.stop();
} catch {}
```

If `stop()` throws (e.g., native module crash), the error is completely silenced. At minimum, `console.warn` should be present.

**Same issue at lines 89-91 and 104-105.**

### 17. `useMQTT.ts:57-59` — Calls `clientRef.current.end(true)` then sets `clientRef.current = null` without awaiting cleanup

`client.end(true)` is synchronous in MQTT.js (forceful close), but event callbacks may still fire during the teardown. If `on('close')` fires after `clientRef.current = null`, the state update may reference a null client.

**Fix:** Move state reset into the `on('close')` callback of the **old** client before nulling the ref. Or ensure event handlers are removed before `end(true)`.

### 18. `useESP32Context.tsx:221-225` — `AsyncStorage.setItem` and `removeItem` fire-and-forget with only `.catch(console.error)`

Both in `setChipId`:
```ts
AsyncStorage.setItem("floydChipId", nextChipId).catch(console.error);
// ...
AsyncStorage.removeItem("floydChipId").catch(console.error);
```

If AsyncStorage is full (common in React Native when storage exceeds 6MB on Android), writes silently fail. The app would lose the chipId permanently on restart.

**Fix:** Log a user-visible error or retry logic. At minimum, include a descriptive message: `console.error("Failed to persist chipId to AsyncStorage:", err)`.

### 19. `provision.tsx:90` — `deviceId` stale closure in `handleMessage`

```ts
const handleMessage = useCallback((event: WebViewMessageEvent) => {
  // ...
  if (data.type === "provisioning-complete") {
    const cId = data.chipId || deviceId;  // <-- deviceId from closure
```

`handleMessage` depends on `deviceId` but `deviceId` is in the closure captured at creation time. If `device-info-found` updates `deviceId` and then a `provisioning-complete` arrives in the same React batch, `handleMessage` sees the stale `deviceId`.

**Fix:** Add `deviceId` to the dependency array of `useCallback`:

```ts
const handleMessage = useCallback((event: WebViewMessageEvent) => {
  // ...
}, [deviceId, setChipId]);
```

Currently it's only `[deviceId, setChipId]` — that's correct, but the stale read of `deviceId` inside the callback is still possible if the closure was created before the state update. This is a low-probability edge case, since WebView messages are async (comes from JS injection interval), but still a latent bug.

### 20. `app/(tabs)/history.tsx:67` — Non-null assertion on `deviceData.lastUpdate`

```ts
timestamp: new Date(deviceData.lastUpdate!), // Safe because we check lastUpdate exists above
```

The guard `if (isConnected && deviceData.lastUpdate)` checks truthiness, but `lastUpdate` is a number (timestamp). `0` is a falsy number, so if `lastUpdate` is `0` (Unix epoch), the condition fails and no log is created. Rare, but incorrect.

**Fix:** Use explicit `!== undefined` check.

### 21. `useAlerts.ts:80-90` — `CONNECTION_LOST` alert type is declared but never generated

The `Alert` type has `"CONNECTION_LOST"` but `generateAlerts()` never emits it. When the MQTT connection drops, there's no alert — the UI just shows "Disconnected". Users may not notice if they're on a different tab.

**Fix:** Generate a `CONNECTION_LOST` alert in `useAlerts` when `!isConnected` is detected after having been previously connected. Track connection state with a ref to detect transitions.

### 22. `useMDNS.ts:57-82` — Event listeners are never removed on unmount

```ts
zeroconf.on("resolved", handleResolved);
zeroconf.on("error", handleError);
```

If the component using `useMDNS` unmounts while scanning, `handleResolved` and `handleError` are still registered on the Zeroconf instance. If a service resolves after unmount, `handleResolved` calls `setState` on an unmounted component (React warns in dev, but in prod it silently leaks). The `zeroconfRef` is cleared in `stopScan()` but if the consumer never calls `stopScan()`, the listeners live forever.

The `zeroconf` library may emit events even after `stop()` is called. Fix: the `useMDNS` hook should have a cleanup effect (via `useMountEffect` with cleanup return), or return a cleanup function.

### 23. `useMDNS.ts:2` — `Zeroconf` type import may not match runtime API

```ts
import Zeroconf from "react-native-zeroconf";
```

The type signature of the `scan` method and event parameters should be checked against the actual runtime. The `handleResolved` function destructures `name`, `host`, `port` from a `service` object, but `react-native-zeroconf` v0.14.x emits `{ name, host, port, fullName, ... }`. The host string may include a trailing dot (fully qualified domain name) — `service.host.replace(/\.$/, '')` may be needed.

### 24. `components/ESP32Connection.tsx:161-174` — "Troubleshooting Tips" section with hardcoded text

The troubleshooting help is static text. If the user changed WiFi networks or the device changed IP, this text never updates. Could be enhanced to show dynamic info (e.g., last known chipId, WiFi SSID, scan timeout indication).

### 25. `app/(tabs)/index.tsx:64-66` — Pull-to-refresh min timing doesn't distinguish success vs failure

```ts
const minRefreshTime = success ? 800 : 1500;
setTimeout(() => {
  setIsRefreshing(false);
}, minRefreshTime);
```

`requestSensorData()` returns `true` if the MQTT client is connected and the publish was enqueued. It returns `false` if disconnected. But the UI always shows the refresh as "succeeded" after the timeout. If `success=false`, the user gets a spinner for 1.5s then no error feedback — the refresh just stops without indication that no data was requested.

**Fix:** Show a brief toast/error when `success=false`, e.g. "Feeder is offline — could not refresh."

---

## Summary

| Priority | Count |
|----------|-------|
| **P0**   | 5     |
| **P1**   | 8     |
| **P2**   | 12    |
| **Total**| 25    |

### Top 5 Actions

1. **Fix `useMemo` driving MQTT connection** — This is the most dangerous pattern in the codebase. Replace with explicit lifecycle management (P0#2).
2. **Guard `connect()` against reentrancy** — Add a connecting guard ref (P0#1).
3. **Add mDNS scan timeout** — Prevent indefinite "searching" state (P1#12).
4. **Add provisioning WebView timeout** — Detect missing ESP32 AP gracefully (P0#4).
5. **Replace AsyncStorage writes inside `setState` updaters** — Use ref journal + debounced flush to prevent data loss (P0#5).
