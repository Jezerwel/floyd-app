# TypeScript/React Patterns Review — Floyd Feeder (LAN-only branch)

**Branch:** `local-connection`  
**Date:** 2026-05-03  
**Reviewer:** Code Review Agent (TypeScript & React Patterns)  

---

## 🔴 P0 — Blocker

### 1. `useMemo` used as side-effect hook in context — no cleanup, fragile semantics

**Files:**  
- `hooks/useESP32Context.tsx:202-219`  
- `hooks/useScheduleMQTT.ts:48-62`

**Problem:**  
Two `useMemo` blocks in the provider call `startScan()` and `mqttConnect()` — both side effects — with no cleanup return:

```tsx
// useESP32Context.tsx:202
useMemo(() => {
  if (chipId) startScan();
  return undefined;
}, [chipId, startScan]);

// useESP32Context.tsx:209
useMemo(() => {
  if (discoveredFeeder && chipId) {
    const brokerUrl = `mqtt://${discoveredFeeder.host}:${discoveredFeeder.port}`;
    mqttConnect(brokerUrl, chipId);
  }
  return undefined;
}, [discoveredFeeder, chipId, mqttConnect]);
```

Same pattern in `useScheduleMQTT.ts:48-62` calls `fetchSchedules()` and `setSchedulesLocal(...)` inside `useMemo`.

**Why it's a blocker:**

- **React docs explicitly warn:** `useMemo` is for computing values during render. Side effects belong in effects or event handlers.
- **Zero cleanup:** `mqttConnect()` creates a persistent MQTT connection. If the component re-renders due to a parent change, `useMemo` could re-run (React reserves the right to discard memoized values), creating a second connection without tearing down the first.
- **No shutdown path:** The `useMemo` at line 209 has no return/cleanup, so if `discoveredFeeder` changes to a different feeder or `chipId` changes, the old MQTT client is never disconnected. The new `disconnect` inside `connect()` in `useMQTT.ts` does handle this (it calls `clientRef.current.end(true)`), but only if the new `connect` call actually runs. This happens to work, but the pattern is fragile.
- **Misleading intent:** Every future reader will wonder "what value is being memoized here?" The answer is "nothing" — the return is `undefined`.

**Consequences demonstrated:**

If a re-render is forced (e.g., `AsyncStorage` call triggers a state update during `setChipId`), the `useMemo` at line 209 could re-execute `mqttConnect` again, creating a duplicate connection. The `useMQTT` `connect` function does `clientRef.current.end(true)` before creating a new one, which masks the bug — but if React ever inlines the memo, you get connection thrashing.

**Fix:** Replace both with `useEffect` (or `useMountEffect` where appropriate) with proper cleanup. For the MQTT connection specifically:

```tsx
useEffect(() => {
  if (discoveredFeeder && chipId) {
    const brokerUrl = `mqtt://${discoveredFeeder.host}:${discoveredFeeder.port}`;
    mqttConnect(brokerUrl, chipId);
    return () => mqttDisconnect(); // cleanup
  }
}, [discoveredFeeder, chipId, mqttConnect, mqttDisconnect]);
```

For `useScheduleMQTT.ts`, the `fetchSchedules` call should also be in a proper `useEffect`. The `deviceData.schedules` -> `setSchedulesLocal` sync should use a key-based reset (Rule 5 of `no-use-effect`).

---

### 2. Unsafe MQTT message dispatch — no runtime type validation, `schedules_list` double-cast

**Files:**  
- `hooks/useMQTT.ts:80` — `parsed = JSON.parse(...) as MQTTMessage`  
- `hooks/useESP32Context.tsx:154-157` — `(message.data as unknown as Schedule[])`

**Problem:**  

1. `hooks/useMQTT.ts:80`:
```tsx
const parsed = JSON.parse(payload.toString()) as MQTTMessage;
```
This is a pure type-assertion cast with zero runtime validation. If the ESP32 firmware sends a malformed message (missing `type` field, wrong `data` shape, or a firmware bug sends garbage), the `as MQTTMessage` cast will cause TypeScript to trust a non-conforming object. Downstream code will receive an object whose shape violates its types — leading to `undefined.method()` crashes or data corruption.

2. `hooks/useESP32Context.tsx:154-157` — the `schedules_list` handler:
```tsx
case "schedules_list":
  setDeviceData((prev) => ({
    ...prev,
    schedules: (message.data as unknown as Schedule[]) ?? prev.schedules,
    ...
  }));
```
The double cast `as unknown as Schedule[]` bypasses type safety entirely. If the device sends `{ "schedules": "corrupted" }`, `message.data` will be `{ schedules: "corrupted" }`. The cast tells TypeScript "trust me, it's Schedule[]", so `.map()`, `.filter()`, and other array methods will crash at runtime because the value is actually a string.

**Impact:** Any malformed MQTT message can crash the app silently. No error boundary catches it (see Finding P1-4). The app shows blank/NaN UI or throws uncaught runtime errors.

**Fix:**  

For `schedules_list`, validate at the boundary:
```tsx
case "schedules_list": {
  const raw = message.data;
  const schedules = Array.isArray(raw) ? raw as Schedule[] : prev.schedules;
  setDeviceData((prev) => ({
    ...prev,
    schedules,
    lastUpdate: message.timestamp,
  }));
  break;
}
```

For `MQTTMessage`, consider a runtime validator (zod, io-ts, or a manual guard):
```tsx
function isMQTTMessage(raw: unknown): raw is MQTTMessage {
  if (!raw || typeof raw !== 'object') return false;
  const msg = raw as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    ['sensor_data', 'control_response', 'error', 'status', 'schedules_list'].includes(msg.type) &&
    typeof msg.data === 'object' &&
    typeof msg.timestamp === 'number'
  );
}
```

---

## 🟠 P1 — Major Gap

### 3. No error boundaries — `JSON.parse` + switch could crash the entire app

**Files:**  
- `app/_layout.tsx` — Stack navigator has no `ErrorBoundary`  
- `hooks/useMQTT.ts:78-86` — catch-only, no UI feedback

**Problem:**  
There are zero error boundaries in the app. The `RootLayout` in `app/_layout.tsx` renders a `Stack` with no error boundary wrapper. The `expo-router` `ErrorBoundary` export exists but is never used.

When `JSON.parse` fails in the MQTT message handler (`useMQTT.ts:78`), the `catch` block logs the error to console but:
- The consumer (`handleMessage` in `useESP32Context`) is never notified
- No state reflects the failure
- No retry mechanism exists

If the `switch` in `handleMessage` receives an unknown `type`, it silently falls through. If `message.data` is null during a `schedules_list` event, the `as unknown as Schedule[]` cast propagates `null` which will crash any consumer calling `.map()` on it.

**Fix:**  
- Wrap the top-level Stack in `app/_layout.tsx` with an error boundary:
```tsx
import { ErrorBoundary } from 'expo-router';

<ErrorBoundary>
  <Stack>
    ...
  </Stack>
</ErrorBoundary>
```
- Add a default case to the `switch` in `handleMessage` that sets an error state.
- Consider bubbling parse errors to the UI via a toast notification.

---

### 4. Context value recreates on every `deviceData` update — cascading re-renders

**Files:**  
- `hooks/useESP32Context.tsx:290-317` — context value memoization  
- `app/(tabs)/index.tsx` — destructures `deviceData` at top level  
- `app/(tabs)/controls.tsx` — same pattern  
- `app/(tabs)/schedule.tsx` — same pattern  
- `app/(tabs)/history.tsx` — same pattern  
- `components/ESP32Connection.tsx` — same pattern  

**Problem:**  
The context exposes 22 values in a single `ESP32Context`. The `contextValue` is memoized, but `deviceData` is spread directly into the value:

```tsx
const contextValue = useMemo(() => ({ ...deviceData ... }), [deviceData, ...]);
```

Every time the ESP32 sends a sensor reading (potentially every few seconds), `deviceData` gets a new object reference. This causes the entire context value to be recomputed, which triggers re-renders in **all** context consumers — even those that only need `isConnected` or `chipId`.

**Impact:**  
- `ControlScreen` re-renders when temperature changes (unnecessary — it only needs `motorState` and `isConnected`)
- `ScheduleScreen` re-renders when distance changes (unnecessary — it only needs `deviceData.schedules`)
- `ESP32Connection` re-renders when food level changes (unnecessary — it only needs connection state)

With sensor data arriving every 2-10 seconds, this means ~5-25 unnecessary re-renders per minute across all screens.

**Fix (two options, do both):**  

1. **Split the context** into at least two contexts:
   - `ESP32ConnectionContext` — `isConnected`, `isConnecting`, `error`, `connect`, etc.
   - `ESP32DataContext` — `deviceData`, `feedLogs`
   
   This way, screens that only need connection state don't re-render on sensor data changes.

2. **Memoize deviceData sub-values in consumers** — each screen should pull only what it needs:
```tsx
// Instead of:
const { deviceData, isConnected } = useESP32();

// Do:
const deviceData = useESP32().deviceData; // still re-renders
// Or better, use selector-style:
const isConnected = useESP32Connection(); // stable, no re-render for data changes
```

---

### 5. `useAlerts` generates relative timestamps that immediately go stale

**File:** `hooks/useAlerts.ts:158-173`

**Problem:**  
The `generateAlerts` function creates timestamps as absolute strings:
```tsx
const currentTime = new Date().toLocaleString();
```

Then `useMemo` converts them to relative time:
```tsx
const alertData = useMemo(() => {
  const rawAlerts = generateAlerts(deviceData, isConnected, thresholds);
  const alerts = rawAlerts.map((alert) => ({
    ...alert,
    timestamp: getRelativeTime(alert.timestamp), // "Just now"
  }));
  ...
}, [deviceData, isConnected]);
```

Since `useMemo` only recomputes when `deviceData` or `isConnected` changes, if the user opens the dashboard and stares at it for 5 minutes, every alert still says "Just now" even though 5 minutes have passed.

**Fix:**  
Two options:
- Compute relative time inline in the render (it's cheap — string concatenation)
- Use a separate interval state that forces re-computation every 30-60 seconds

---

### 6. `useScheduleMQTT` duplicates state that already lives in `deviceData.schedules`

**File:** `hooks/useScheduleMQTT.ts`

**Problem:**  
This hook creates a duplicate local `schedules` state:
```tsx
const [schedules, setSchedulesLocal] = useState<Schedule[]>([]);
```

It then syncs from `deviceData.schedules` via `useMemo`:
```tsx
useMemo(() => {
  if (deviceData?.schedules && Array.isArray(deviceData.schedules)) {
    setSchedulesLocal(deviceData.schedules as Schedule[]);
    setLoading(false);
  }
}, [deviceData]);
```

This introduces a **two-way sync problem**: `pushSchedules` updates both the device (via MQTT) AND the local state:
```tsx
if (ok) setSchedulesLocal(newSchedules);
```

But `deviceData.schedules` will also be updated when the device responds. So there are two sources of truth that can diverge if:
1. `pushSchedules` succeeds but the device response never arrives (network glitch)
2. The device response arrives before `setSchedulesLocal` runs

**Fix:**  
Remove local state entirely. Consumers should read `deviceData.schedules` directly from context. The `fetchSchedules`/`pushSchedules` methods should remain as wrappers, but not duplicate state:

```tsx
export function useScheduleMQTT() {
  const { isConnected, publishCommand, deviceData, publishScheduleSync } = useESP32();
  const [loading, setLoading] = useState(false);

  const schedules = deviceData?.schedules ?? [];

  const fetchSchedules = useCallback(() => {
    if (!isConnected) return;
    setLoading(true);
    publishCommand("get_schedules");
    // loading will be cleared when schedules_list message arrives
  }, [isConnected, publishCommand]);

  const pushSchedules = useCallback((newSchedules: Schedule[]) => {
    if (!isConnected) return false;
    return publishScheduleSync(newSchedules);
  }, [isConnected, publishScheduleSync]);

  return { schedules, loading, fetchSchedules, pushSchedules };
}
```

And clear loading when `deviceData.schedules` changes (which happens in `handleMessage`).

---

### 7. `feedLogs` setter has hidden side effects — setFeedLogs also persists

**File:** `hooks/useESP32Context.tsx:237-241`

**Problem:**  
The `setFeedLogs` callback both updates state AND writes to AsyncStorage:
```tsx
const setFeedLogs = useCallback((logs: FeedLogEntry[]) => {
  setFeedLogsState(logs);
  AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(console.error);
}, []);
```

This violates the **principle of least surprise**. Consumers calling `setFeedLogs([])` expect to clear state — they don't expect a file I/O side effect that could fail (and the `.catch` silently swallows the error).

Meanwhile, the `handleMessage` callback also persists inside `setFeedLogsState`'s updater:
```tsx
setFeedLogsState((prev) => {
  const next = [newEntry, ...prev].slice(0, 100);
  AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(next)).catch(console.error);
  return next;
});
```

So persistence happens in two places for the same data.

**Fix:**  
Either:
- Make `setFeedLogs` a pure state setter (no AsyncStorage)
- Move persistence to an effect that watches `feedLogs`
- Or document clearly that `setFeedLogs` persists

---

## 🟡 P2 — Minor Gap

### 8. `useMDNS` new error handling is robust but still leaks on unmount

**File:** `hooks/useMDNS.ts`

**Problem:**  
The new `useMDNS` hook (current diff) properly wraps `new Zeroconf()` in try-catch and handles `scan()` errors. However, the hook is consumed in `useESP32Context.tsx`:

```tsx
const { startScan, stopScan: _stopScan } = useMDNS(chipId);
```

The `_stopScan` is prefixed with underscore and **never called**. The old code used a `globalThis.__floydMdnsCleanup` hack to store a cleanup reference globally. That's been removed (good), but now there's **no cleanup path at all**.

If the user navigates away mid-scan, the Zeroconf module keeps scanning indefinitely. On re-mount, a second scan starts, creating duplicate event listeners.

**Fix:**  
Call `stopScan` in a cleanup effect:
```tsx
// In useESP32Context.tsx
const { startScan, stopScan } = useMDNS(chipId);

useEffect(() => {
  return () => stopScan();
}, [stopScan]);
```

---

### 9. `IconSymbol` weight prop is declared but unused — silent dead prop

**File:** `components/ui/IconSymbol.tsx:49-60`

**Problem:**  
The `IconSymbol` interface declares a `weight` prop but never destructures or uses it:
```tsx
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;   // <-- declared but never used
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
```

The iOS-specific version (`IconSymbol.ios.tsx`) probably uses it. This creates a cross-platform inconsistency where `weight` works on iOS but is silently dropped on Android/web.

**Fix:** Either remove the prop from the cross-platform component or add a comment explaining the platform divergence.

---

### 10. `as any` casts for icon names — brittle, bypasses type checking

**Files:**  
- `app/(tabs)/index.tsx:149` — `motorConfig.icon as any`  
- `app/(tabs)/controls.tsx:41` — `width: \`${value}%\` as any`  
- `components/ui/AnimatedButton.tsx:84` — `name={icon as "link"}`  
- `components/ui/AnimatedButton.tsx:155` — `name={icon as "link"}`  

**Problem:**  
`IconSymbol` uses a strict `IconSymbolName` type derived from the `MAPPING` keyof. But components bypass it:

```tsx
// index.tsx:149
<IconSymbol name={motorConfig.icon as any} size={20} ... />
```

The `MOTOR_STATE_CONFIG` uses dynamic icon names like `"circle"`, `"arrow.triangle.2.circlepath"`, etc. These ARE in the MAPPING, so the `as any` cast is unnecessary — TypeScript just sees `icon` as `string` from the config record. If a new motor state is added with a typo in the icon name, the `as any` silences the error.

Similarly, `AnimatedButton.tsx` casts `icon as "link"` which is always wrong — it's not always "link".

**Fix:** Type the config values properly:
```tsx
const MOTOR_STATE_CONFIG: Record<string, { icon: IconSymbolName; ... }> = { ... };
```

For `AnimatedButton`, make the `icon` prop use `IconSymbolName`:
```tsx
interface AnimatedButtonProps {
  icon?: IconSymbolName;
  ...
}
```

---

### 11. `useAlerts` typed as `any` — defeats type safety

**File:** `hooks/useAlerts.ts:53`

**Problem:**  
The `generateAlerts` function signature uses `any`:
```tsx
const generateAlerts = (
  deviceData: any,
  isConnected: boolean,
  thresholds: typeof DEFAULT_THRESHOLDS
): Alert[] => {
```

This should be `Partial<ESP32Data>` or the full `ESP32Data` type from context. Using `any` means if the context's `deviceData` shape changes (e.g., `foodLevelPercentage` renamed to `foodLevel`), TypeScript won't catch the mismatch — it will just silently produce `undefined` values.

**Fix:**
```tsx
const generateAlerts = (
  deviceData: Partial<ESP32Data>,
  isConnected: boolean,
  thresholds: typeof DEFAULT_THRESHOLDS
): Alert[] => {
```

---

### 12. `history.tsx` uses `useEffect` for data logging — violates `no-use-effect` rules

**File:** `app/(tabs)/history.tsx:54-80`

**Problem:**  
The log screen uses a `useEffect` to log sensor data into a local array:
```tsx
useEffect(() => {
  if (isConnected && deviceData.lastUpdate) {
    setSensorLogs((prev) => {
      const lastEntry = prev[0];
      if (lastEntry?.timestamp.getTime() === deviceData.lastUpdate) {
        return prev;
      }
      const newLogEntry: SensorLogEntry = { ... };
      return [newLogEntry, ...prev].slice(0, 50);
    });
  }
}, [isConnected, deviceData.lastUpdate, ...other deps...]);
```

This is a "sync props to state" pattern — exactly what `useEffect` should not do per the `no-use-effect` rules. The sensor logs are derived from `deviceData` changes over time.

**Fix:**  
This is a legitimate case of append-on-change, which is one of the few valid reasons for an effect. However, it could be refactored using a custom `useReplay` hook that captures a rolling log. The current implementation has a bug: `deviceData.lastUpdate` is a Unix timestamp (number), but it's compared with `getTime()` which returns a number too — actually this works. But the duplicate detection is fragile because the same sensor reading could arrive twice (same `lastUpdate`) and be silently dropped even though it's valid to show.

Better: Use a monotonic counter or the entry's `id` field for deduplication instead of comparing timestamps.

---

### 13. `StatCard` type-casts icon to `"link"` — incorrect assertion

**File:** `components/ui/StatCard.tsx:36`

```tsx
<IconSymbol name={icon as "link"} size={20} color={color} />
```

The `icon` prop is typed as `string`, but it's always a `IconSymbolName`. The cast `as "link"` is incorrect — it could be `"thermometer"`, `"wifi"`, etc. On Android/web, this just works because `MaterialIcons` accepts string names that mismatch, but it's still a lie to TypeScript.

**Fix:** Change the prop type to `IconSymbolName`:
```tsx
interface StatCardProps {
  icon: IconSymbolName;
  ...
}
```

---

### 14. `CircularProgress` uses four-color border hack — not a true circular progress

**File:** `components/ui/CircularProgress.tsx:66-80`

```tsx
<View
  style={[styles.progressCircle, {
    ...
    borderTopColor: displayValue > 25 ? displayColor : "transparent",
    borderRightColor: displayValue > 50 ? displayColor : "transparent",
    borderBottomColor: displayValue > 75 ? displayColor : "transparent",
    borderLeftColor: displayValue > 0 ? displayColor : "transparent",
  }]}
/>
```

This is a CSS hack that creates a segmented ring — not a smooth progress arc. A value of 30% will show only the top-right quarter filled, with the rest transparent. At 55%, only top and right borders show. This gives misleading visual feedback.

**Fix:** Use `react-native-svg` for a proper arc-based circular progress, or accept the segmented look with a comment explaining the tradeoff.

---

### 15. `connectionAttempts` increments but is never reset on connections lost without reconnect

**File:** `hooks/useMQTT.ts:108-110`

```tsx
client.on("reconnect", () => {
  setState((prev) => ({
    ...prev,
    connectionAttempts: prev.connectionAttempts + 1,
  }));
});
```

`connectionAttempts` increments on reconnect callbacks but never decrements. On a flaky network, this counter ratchets up infinitely. Since the context exposes it to the UI, users could see "Attempt #385" after a few minutes.

**Fix:** Reset the counter on successful `"connect"` (already done at line 99). Consider a MAX threshold for UI display.

---

### 16. `useMDNS` handler closure captures `zeroconf` variable, not ref

**File:** `hooks/useMDNS.ts:72-95`

**Problem:**  
The `handleResolved` and `handleError` closures are created inside `startScan` and capture the local `zeroconf` variable:

```tsx
const handleResolved = (service) => {
  ...
  try { zeroconf.stop(); } catch {}
};

const handleError = (err) => { ... };

zeroconf.on("resolved", handleResolved);
zeroconf.on("error", handleError);
```

If `startScan` is called twice (rejected because the early return `if (zeroconfRef.current) return` prevents it), this is safe. But it's subtle — the closures capture the local `zeroconf` rather than `zeroconfRef.current`. If the ref were updated independently of the closures (it's not in current code, but future changes might), the closures would stop working.

**Fix:** Add a comment or refactor to use `zeroconfRef.current` inside handlers:
```tsx
const handleResolved = (service) => {
  ...
  try { zeroconfRef.current?.stop(); } catch {}
};
```

---

### 17. `handleRefresh` has a timing-based race condition

**File:** `app/(tabs)/index.tsx:45-52`

```tsx
const handleRefresh = useCallback(async () => {
  if (isRefreshing || !isConnected) return;
  setIsRefreshing(true);
  const success = requestSensorData();
  const minRefreshTime = success ? 800 : 1500;
  setTimeout(() => { setIsRefreshing(false); }, minRefreshTime);
}, [isRefreshing, isConnected, requestSensorData]);
```

This uses arbitrary timeouts to reset the refresh state rather than waiting for the actual MQTT response. If the network is slow (>1.5s), the refresh indicator disappears before data arrives. If it's fast (<800ms), the user waits for no reason.

**Fix:** Tie `isRefreshing` to actual data arrival:
```tsx
useEffect(() => {
  if (isRefreshing && deviceData.lastUpdate) {
    setIsRefreshing(false);
  }
}, [deviceData.lastUpdate]);
```

---

## 📊 Summary by Category

| Category | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| React Anti-patterns (useMemo-as-useEffect) | 1 | 0 | 0 | 1 |
| Type Safety / Casts | 1 | 0 | 3 | 4 |
| Re-render / Performance | 0 | 1 | 0 | 1 |
| State Management | 0 | 2 | 0 | 2 |
| Component Quality | 0 | 0 | 3 | 3 |
| Error Handling / Boundaries | 0 | 1 | 1 | 2 |
| Cleanup / Lifecycle | 0 | 0 | 2 | 2 |
| Minor/Other | 0 | 0 | 2 | 2 |
| **Total** | **2** | **4** | **11** | **17** |

---

## ✅ Things Done Well

- **`IconSymbol` MAPPING pattern** — Using `keyof typeof MAPPING` for strict icon names is excellent
- **`useMountEffect`** — Clean abstraction for mount-only effects, follows the `no-use-effect` guidance
- **`useMDNS` error handling (new diff)** — Proper try-catch for `new Zeroconf()`, `stop()`, and `scan()` is a big improvement over the old code
- **`AnimatedButton` press feedback** — Good use of scale animation for touch response
- **`ConnectionBadge`** — Clean, well-typed component with clear variants
- **Context value memoization** — Despite the size issue, the full dependency array is correct and prevents unnecessary context recomputation (only `deviceData` changes cause it)
- **Sensor value validation in `useAlerts`** — The `validateSensorValue` and `SENSOR_RANGES` constants provide a safety net for sensor data bounds
