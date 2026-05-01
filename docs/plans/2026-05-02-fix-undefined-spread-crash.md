# Fix "Cannot convert undefined value to object" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent Hermes crash when API responses or schedule data contain undefined values that get spread into objects/arrays.

**Architecture:** Add defensive guards at three layers: (1) API response parsing with `res.ok` checks, (2) state setters with truthiness guards before updating arrays, (3) spread operations with nullish coalescing defaults. Additionally, add missing `useEffect` to load schedules on screen mount.

**Tech Stack:** React Native 0.83 + Expo, Hermes JS engine, TypeScript

---

## Verified from Research

1. **`fetch()` does NOT throw on HTTP 4xx/5xx** — must check `res.ok` ([React Native docs](https://reactnative.dev/docs/network), [react.wiki](https://react.wiki/api/error-handling-patterns/))
2. **`res.json()` crashes on non-JSON responses** — must wrap in try/catch ([Medium guide](https://medium.com/%40mdfaciolo/the-correct-way-to-use-fetch-in-react-native-expo-06c6d3e86dbd))
3. **Hermes throws "Cannot convert undefined value to object" when spreading `{...undefined}`** — V8/JSC silently returns `{}` ([React Native #25634](https://github.com/facebook/react-native/issues/25634), [Reanimated #4139](https://github.com/software-mansion/react-native-reanimated/issues/4139))
4. **Poisoned state arrays** — once `setSchedules([...prev, undefined])` runs, every subsequent render that spreads or accesses item properties cascades errors

---

### Task 1: Add `res.ok` checks and safe JSON parsing to all API fetchers

**Files:**
- Modify: `app/(tabs)/schedule.tsx:61-101`

**Why:** `fetch()` doesn't reject on 4xx/5xx. `res.json()` crashes on empty/non-JSON bodies. Both infect state with undefined.

**Step 1: Add a `safeJson` helper**

```ts
async function safeJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("Invalid JSON response from server");
  }
}
```

**Step 2: Update `fetchSchedules`**

```ts
async function fetchSchedules(): Promise<Schedule[]> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`);
  const data = await safeJson<Schedule[]>(res);
  return Array.isArray(data) ? data : [];
}
```

**Step 3: Update `createSchedule`**

```ts
async function createSchedule(data: { ... }): Promise<Schedule> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return safeJson<Schedule>(res);
}
```

**Step 4: Update `updateSchedule`**

```ts
async function updateSchedule(id: string, data: { ... }): Promise<Schedule> {
  const res = await fetch(`${CLOUD_SERVER}/api/schedules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return safeJson<Schedule>(res);
}
```

**Step 5: Verify**

Run: `npx tsc --noEmit` — should compile without errors.

---

### Task 2: Guard `handleSave` state updates against undefined API responses

**Files:**
- Modify: `app/(tabs)/schedule.tsx:202-210`

**Why:** Even with Task 1, add a second layer of defense — if `safeJson` somehow returns undefined or the catch block is hit, don't poison the state array.

**Step 1: Guard the state setter in `handleSave`**

Change lines 202-210 from:
```tsx
if (editingId) {
  const updated = await updateSchedule(editingId, payload);
  setSchedules((prev) =>
    prev.map((s) => (s._id === editingId ? updated : s)),
  );
} else {
  const created = await createSchedule(payload);
  setSchedules((prev) => [...prev, created]);
}
```

To:
```tsx
if (editingId) {
  const updated = await updateSchedule(editingId, payload);
  if (updated && updated._id) {
    setSchedules((prev) =>
      prev.map((s) => (s._id === editingId ? updated : s)),
    );
  }
} else {
  const created = await createSchedule(payload);
  if (created && created._id) {
    setSchedules((prev) => [...prev, created]);
  }
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 3: Guard spread operations against undefined properties

**Files:**
- Modify: `app/(tabs)/schedule.tsx:165,223,236`

**Why:** Hermes throws on `{...undefined}` and `[...undefined]`. These are the three spread operations that can receive undefined.

**Step 1: Guard `openEditModal` — `schedule.days` spread**

Change line 165 from:
```tsx
setFormDays([...schedule.days]);
```
To:
```tsx
setFormDays([...(schedule.days ?? [false, false, false, false, false, false, false])]);
```

**Step 2: Guard `handleToggleEnabled` — schedule object spread (success path)**

Change line 223 from:
```tsx
s._id === schedule._id ? { ...s, enabled: newEnabled } : s,
```
To:
```tsx
s && s._id === schedule._id ? { ...s, enabled: newEnabled } : s,
```

**Step 3: Guard `handleToggleEnabled` — schedule object spread (rollback path)**

Change line 236 from:
```tsx
s._id === schedule._id ? { ...s, enabled: schedule.enabled } : s,
```
To:
```tsx
s && s._id === schedule._id ? { ...s, enabled: schedule.enabled } : s,
```

**Step 4: Guard FlatList `keyExtractor` and data**

Add a filter to the FlatList data to strip undefined entries (line 339-340):
```tsx
<FlatList
  data={schedules.filter((s): s is Schedule => !!s && !!s._id)}
  keyExtractor={(item) => item._id}
```

**Step 5: Verify**

Run: `npx tsc --noEmit`

---

### Task 4: Add `useEffect` to load schedules on screen mount

**Files:**
- Modify: `app/(tabs)/schedule.tsx:107-141`

**Why:** Currently schedules only load on pull-to-refresh. No initial data fetch.

**Step 1: Add `useEffect` for initial load**

Add import (line 7):
```tsx
import React, { useCallback, useEffect, useState } from "react";
```

Add after `loadSchedules` definition (after line 134):
```tsx
useEffect(() => {
  loadSchedules();
}, [loadSchedules]);
```

**Step 2: Verify**

Run: `npx tsc --noEmit`

---

### Task 5: Apply same `res.ok` guard to history screen (defense-in-depth)

**Files:**
- Modify: `app/(tabs)/history.tsx:64-74`

**Why:** Same vulnerability — `res.json()` without `res.ok` check.

**Step 1: Update `fetchFeedHistory`**

Change lines 64-74 from:
```tsx
const fetchFeedHistory = useCallback(async () => {
  try {
    const res = await fetch(`${CLOUD_SERVER}/api/history?limit=50`);
    const data = await res.json();
    if (data.success && data.logs) {
      setFeedLogs(data.logs);
    }
  } catch (err) {
    console.error("Failed to fetch feed history:", err);
  }
}, []);
```

To:
```tsx
const fetchFeedHistory = useCallback(async () => {
  try {
    const res = await fetch(`${CLOUD_SERVER}/api/history?limit=50`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (data.success && data.logs) {
      setFeedLogs(data.logs);
    }
  } catch (err) {
    console.error("Failed to fetch feed history:", err);
  }
}, []);
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
