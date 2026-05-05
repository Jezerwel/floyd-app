# Remove Cloud — Direct WiFi Connection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all cloud dependencies (HiveMQ MQTT broker + Railway Express server) and replace with direct WiFi LAN connection between the React Native app and ESP32 feeder.

**Architecture:** The ESP32 becomes a local MQTT broker + NTP-synced scheduler + mDNS advertiser. The app discovers the feeder via mDNS (`floyd-feeder-{chipId}.local`), connects MQTT directly to its IP on port 1883, and persists feed history + alert configs in AsyncStorage. Scheduling runs autonomously on the ESP32; the app is a remote control + config editor.

**Tech Stack:** React Native (Expo, EAS Build) + `react-native-zeroconf` (mDNS) + `mqtt` v5 (unchanged) + AsyncStorage. ESP32: Arduino + `sMQTTBroker` (embedded broker) + `ezTime` (NTP) + `ESPmDNS` + `Preferences` (NVS).

---

## Decision Recap

| #   | Decision           | Choice                                                   |
| --- | ------------------ | -------------------------------------------------------- |
| 1   | Protocol           | ESP32 as local MQTT broker, plaintext port 1883          |
| 2   | Discovery          | mDNS: `ESPmDNS` on ESP32, `react-native-zeroconf` on app |
| 3   | Scheduling         | ESP32-side cron with NTP (`ezTime`)                      |
| 4   | Persistence        | App-side AsyncStorage (JSON arrays)                      |
| 5   | Provisioning       | Strip MQTT cred params from WiFiManager; no cloud claim  |
| 6   | Multi-device       | Single device only                                       |
| 7   | NTP library        | `ezTime`                                                 |
| 8   | Express server     | Delete `server/` entirely                                |
| 9   | Connection UX      | Dashboard-first with auto-discovery banner               |
| 10  | Schedule protocol  | Full-sync: `get_schedules` / `set_schedules` over MQTT   |
| 11  | Schedule hook      | New `useScheduleMQTT` hook                               |
| 12  | WiFiManager params | Strip to WiFi SSID/password only                         |
| 13  | Alert configs      | Hardcoded in `useAlerts.ts`                              |
| 14  | State model        | Binary: connected/disconnected                           |
| 15  | ESP32Connection    | Rewrite in-place, remove cloud language                  |
| 16  | mDNS dep           | `react-native-zeroconf`                                  |
| 17  | Feed history       | Single AsyncStorage JSON array key `floyd-feedlogs`      |
| 18  | Schedule sync      | Full array get/set, not per-schedule CRUD                |
| 19  | Build/env          | Strip `EXPO_PUBLIC_*` vars; keep EAS Build               |

---

## Phase 1: ESP32 Firmware

### Task 1.1: Add ESPmDNS advertising

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Add include and mDNS setup**

At the top of the file, add the include after the existing includes:

```cpp
#include <ESPmDNS.h>
```

**Step 2: Add mDNS initialization in `setup()`**

After `connectToWiFi()` succeeds and before `configureMQTTClient()`, add:

```cpp
// Advertise MQTT service via mDNS so the app can discover us
bool mdnsOk = MDNS.begin(("floyd-feeder-" + deviceChipId).c_str());
if (mdnsOk) {
  MDNS.addService("mqtt", "tcp", 1883);
  Serial.println("mDNS started: floyd-feeder-" + deviceChipId + ".local");
} else {
  Serial.println("WARNING: mDNS failed to start");
}
```

**Step 3: Add `MDNS.update()` to `loop()`**

In the main loop, add after `yield();`:

```cpp
// Keep mDNS alive (required for ESPmDNS)
MDNS.update();
```

**Step 4: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): add mDNS advertising for local discovery"
```

---

### Task 1.2: Add NTP time sync with ezTime

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Add ezTime dependency note**

ezTime is installed via Arduino Library Manager (`ezTime` by Rop Gonggrijp). Add include:

```cpp
#include <ezTime.h>
```

**Step 2: Declare global timezone variable**

After the `Preferences prefs;` line:

```cpp
Timezone tzLocal;
```

**Step 3: Add function to sync NTP time**

Add this function before `setup()`:

```cpp
void syncNTP() {
  if (WiFi.status() != WL_CONNECTED) return;

  static bool ntpSynced = false;
  if (!ntpSynced) {
    Serial.println("Syncing NTP time...");
    if (waitForSync(10000)) {
      tzLocal.setLocation(F("Asia/Shanghai"));  // default; user-configurable later
      Serial.println("NTP synced: " + UTC.dateTime());
      ntpSynced = true;
    } else {
      Serial.println("NTP sync timeout — will retry");
    }
  }

  if (ntpSynced) {
    events();  // ezTime event processing
  }
}
```

**Step 4: Call `syncNTP()` in `loop()`**

In the main loop, add after `checkWiFiConnection();`:

```cpp
static unsigned long lastNtpUpdate = 0;
if (millis() - lastNtpUpdate > 60000) {  // resync every 60s
  lastNtpUpdate = millis();
  syncNTP();
}
```

**Step 5: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): add NTP time sync via ezTime"
```

---

### Task 1.3: Add embedded MQTT broker

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Install and include sMQTTBroker**

Install `sMQTTBroker` via Arduino Library Manager. Add include at top:

```cpp
#include <sMQTTBroker.h>
```

**Step 2: Declare broker instance**

After existing `PubSubClient mqttClient(wifiClient);`:

```cpp
sMQTTBroker broker;
WiFiServer wifiServer(1883);  // MQTT broker on port 1883
```

**Step 3: Initialize broker in `setup()`**

After mDNS initialization, before `configureMQTTClient()`:

```cpp
// Start embedded MQTT broker on port 1883
wifiServer.begin(1883);
broker.init();
Serial.println("MQTT broker started on port 1883");
```

**Step 4: Handle broker connections in `loop()`**

In the main loop, add before `checkMQTTConnection()`:

```cpp
// Accept new MQTT client connections to the embedded broker
WiFiClient brokerClient = wifiServer.available();
if (brokerClient) {
  broker.accept(brokerClient);
}
```

**Step 5: Remove old HiveMQ client code**

Remove or comment out: `configureMQTTClient()`, `connectMQTT()`, `checkMQTTConnection()`, and the `wifiClient`/`mqttClient` globals. The ESP32 is now the broker — it doesn't connect to an external one.

Instead, use `broker.publish()` and subscribe to topics via the broker.

**Step 6: Adapt message handling to broker**

Replace `mqttClient.publish()` calls with `broker.publish(topic, payload)`. Replace `mqttClient.subscribe()` with broker internal subscription. The command topic listener becomes a broker subscription callback.

**Step 7: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): replace cloud MQTT client with embedded broker"
```

---

### Task 1.4: Add schedule persistence + cron tick

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Define schedule data structure**

Add after `struct AppConfig`:

```cpp
#define MAX_SCHEDULES 10

struct FeedSchedule {
  char id[13];           // 12-char hex + null
  char label[33];        // schedule name
  char time[6];          // "HH:MM"
  char daysOfWeek[14];   // "0,1,2,3,4,5,6"
  int augerSpeed;
  int impellerSpeed;
  unsigned long preSpinMs;
  unsigned long feedMs;
  unsigned long postSpinMs;
  bool enabled;
  unsigned long lastFired; // millis() of last trigger
};

struct ScheduleStore {
  uint8_t count;
  FeedSchedule schedules[MAX_SCHEDULES];
};

ScheduleStore scheduleStore;
```

**Step 2: Add NVS read/write for schedules**

```cpp
#define PREFS_KEY_SCHEDULES "sched"

void loadSchedules() {
  prefs.begin(PREFS_NAMESPACE, false);
  size_t len = prefs.getBytesLength(PREFS_KEY_SCHEDULES);
  if (len == sizeof(ScheduleStore)) {
    prefs.getBytes(PREFS_KEY_SCHEDULES, &scheduleStore, sizeof(ScheduleStore));
    Serial.printf("Loaded %d schedules from NVS\n", scheduleStore.count);
  } else {
    scheduleStore.count = 0;
    Serial.println("No valid schedules in NVS");
  }
  prefs.end();
}

void saveSchedules() {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putBytes(PREFS_KEY_SCHEDULES, &scheduleStore, sizeof(ScheduleStore));
  prefs.end();
  Serial.printf("Saved %d schedules to NVS\n", scheduleStore.count);
}
```

**Step 3: Add schedule cron tick function**

```cpp
void checkSchedules() {
  if (!UTC.isSet()) return;  // no NTP time yet

  String nowTime = UTC.dateTime("H:i");    // "HH:MM"
  int nowDow = UTC.dateTime("w").toInt();  // 0=Sun, 1=Mon, ...

  // Map ezTime dow (0=Sun) to our format (0=Sun)

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    FeedSchedule& sch = scheduleStore.schedules[i];
    if (!sch.enabled) continue;

    String schTime = String(sch.time);
    if (schTime != nowTime) continue;

    // Check day of week
    String days = String(sch.daysOfWeek);
    if (days.indexOf(String(nowDow)) < 0) continue;

    // Prevent re-firing in the same minute
    if (UTC.minute() == 0 && sch.lastFired != 0) {
      unsigned long nowMillis = millis();
      if (nowMillis - sch.lastFired < 59000) continue;  // 59s debounce
    }

    // Fire the feed
    sch.lastFired = millis();
    startFeeding(sch.augerSpeed, sch.impellerSpeed, sch.preSpinMs, sch.feedMs, sch.postSpinMs);

    Serial.printf("Scheduled feed: %s at %s\n", sch.label, nowTime.c_str());
  }
}
```

**Step 4: Call `checkSchedules()` in `loop()` and `loadSchedules()` in `setup()`**

Add `checkSchedules();` in main loop (every cycle is fine; the minute-level debounce prevents re-triggering). Add `loadSchedules();` in `setup()` after `loadConfig()`.

**Step 5: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): add schedule persistence and cron trigger"
```

---

### Task 1.5: Add schedule MQTT command handlers

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Add `get_schedules` and `set_schedules` action handlers in `handleMQTTMessage()`**

Add to the action dispatch:

```cpp
} else if (action == "get_schedules") {
  StaticJsonDocument<2048> rsp;
  rsp["type"] = "schedules_list";
  JsonArray arr = rsp.createNestedArray("data");

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    FeedSchedule& sch = scheduleStore.schedules[i];
    JsonObject obj = arr.createNestedObject();
    obj["id"] = sch.id;
    obj["label"] = sch.label;
    obj["time"] = sch.time;
    obj["daysOfWeek"] = sch.daysOfWeek;
    obj["augerSpeed"] = sch.augerSpeed;
    obj["impellerSpeed"] = sch.impellerSpeed;
    obj["preSpinMs"] = sch.preSpinMs;
    obj["feedMs"] = sch.feedMs;
    obj["postSpinMs"] = sch.postSpinMs;
    obj["enabled"] = sch.enabled;
  }
  rsp["timestamp"] = millis();
  broadcastResponse(rsp);

} else if (action == "set_schedules") {
  JsonArray arr = doc["parameters"]["schedules"];
  scheduleStore.count = min((uint8_t)arr.size(), (uint8_t)MAX_SCHEDULES);

  for (uint8_t i = 0; i < scheduleStore.count; i++) {
    JsonObject obj = arr[i];
    FeedSchedule& sch = scheduleStore.schedules[i];
    strncpy(sch.id, obj["id"] | "", 12);
    strncpy(sch.label, obj["label"] | "Feed", 32);
    strncpy(sch.time, obj["time"] | "08:00", 5);
    strncpy(sch.daysOfWeek, obj["daysOfWeek"] | "0,1,2,3,4,5,6", 13);
    sch.augerSpeed = obj["augerSpeed"] | 768;
    sch.impellerSpeed = obj["impellerSpeed"] | 1023;
    sch.preSpinMs = obj["preSpinMs"] | 1500;
    sch.feedMs = obj["feedMs"] | 3000;
    sch.postSpinMs = obj["postSpinMs"] | 1500;
    sch.enabled = obj["enabled"] | true;
    sch.lastFired = 0;
  }

  saveSchedules();

  StaticJsonDocument<256> rsp;
  rsp["type"] = "control_response";
  rsp["data"]["action"] = "set_schedules";
  rsp["data"]["success"] = true;
  rsp["timestamp"] = millis();
  broadcastResponse(rsp);
}
```

**Step 2: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): add schedule get/set MQTT command handlers"
```

---

### Task 1.6: Strip WiFiManager custom parameters

**Files:**

- Modify: `ESP32_MQTT_Server.ino`

**Step 1: Remove MQTT parameters from `startProvisioningMode()`**

In `startProvisioningMode()`, remove these lines:

```cpp
// REMOVE:
WiFiManagerParameter customMqttBroker("mqttBroker", "MQTT Broker", cfg.mqttBroker, 64);
WiFiManagerParameter customMqttUsername("mqttUsername", "MQTT Username", cfg.mqttUsername, 32);
WiFiManagerParameter customMqttPassword("mqttPassword", "MQTT Password", cfg.mqttPassword, 32);
// and their corresponding: wm.addParameter(...)
```

Keep `customDeviceId` and `customDeviceName` if desired, or remove all custom params for the cleanest experience (see Q12 — strip to WiFi only).

**Step 2: Update `setCustomHeadElement()` text**

Change the HTML hint to remove MQTT references:

```cpp
wm.setCustomHeadElement(
  "<style>body{font-family:system-ui,sans-serif;}button{background:#2e7d32!important;}</style>"
  "<p><strong>Floyd Fish Feeder Setup</strong></p>"
  "<p>Enter your home WiFi credentials below. The feeder will connect to your network.</p>"
);
```

**Step 3: Remove MQTT config save from provisioning**

Remove these lines after `wm.autoConnect()`:

```cpp
// REMOVE:
strncpy(cfg.mqttBroker,   customMqttBroker.getValue(),   63);
strncpy(cfg.mqttUsername, customMqttUsername.getValue(), 32);
strncpy(cfg.mqttPassword, customMqttPassword.getValue(), 32);
```

**Step 4: Remove `generateMqttPassword()` function**

Delete the `generateMqttPassword()` function entirely — no longer needed.

**Step 5: Remove MQTT fields from `AppConfig`**

Remove these fields from the `AppConfig` struct:

```cpp
// REMOVE:
char mqttBroker[64];
char mqttUsername[33];
char mqttPassword[33];
```

**Step 6: Remove MQTT password migration code**

Delete the MIGRATION block in `setup()` that detects stale auto-gen passwords.

**Step 7: Commit**

```bash
git add ESP32_MQTT_Server.ino
git commit -m "feat(esp32): strip cloud MQTT params from WiFiManager"
```

---

### Task 1.7: Update firmware documentation

**Files:**

- Modify: `ESP32_Pin_Layout_Optimization.md`
- Modify: `ESP32_Setup_Guide.md`

Remove all references to HiveMQ Cloud, MQTT broker URLs, MQTT credentials. Add mDNS and local broker setup notes.

---

## Phase 2: App — Dependencies & Infrastructure

### Task 2.1: Install react-native-zeroconf

**Step 1: Install**

```bash
npm install react-native-zeroconf
```

**Step 2: Verify native linking**

```bash
npx expo prebuild --clean
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add react-native-zeroconf for mDNS discovery"
```

---

### Task 2.2: Create useMDNS hook

**Files:**

- Create: `hooks/useMDNS.ts`

Write a hook that:

1. Scans for `_mqtt._tcp.local.` services
2. Filters for `floyd-feeder-` prefix
3. Returns `{ discoveredFeeder: { chipId, host, port } | null, isScanning, error }`
4. Stops scanning when a feeder is found (single-device YAGNI)

```ts
import { useEffect, useRef, useState } from "react";
import Zeroconf from "react-native-zeroconf";

interface DiscoveredFeeder {
  chipId: string;
  host: string;
  port: number;
}

interface MDNSState {
  discoveredFeeder: DiscoveredFeeder | null;
  isScanning: boolean;
  error: string | null;
}

const FEEDER_SERVICE_PREFIX = "floyd-feeder-";

export function useMDNS(targetChipId?: string | null) {
  const [state, setState] = useState<MDNSState>({
    discoveredFeeder: null,
    isScanning: false,
    error: null,
  });
  const zeroconfRef = useRef<Zeroconf | null>(null);

  const startScan = useCallback(() => {
    if (zeroconfRef.current) return; // already scanning

    const zeroconf = new Zeroconf();
    zeroconfRef.current = zeroconf;

    setState((prev) => ({ ...prev, isScanning: true, error: null }));

    zeroconf.on(
      "resolved",
      (service: { name: string; host: string; port: number }) => {
        const name = service.name || "";
        if (!name.startsWith(FEEDER_SERVICE_PREFIX)) return;

        const chipId = name
          .replace(FEEDER_SERVICE_PREFIX, "")
          .replace(/\._mqtt\._tcp\.local\.?$/, "");

        // If targeting a specific chipId, only accept that one
        if (targetChipId && chipId !== targetChipId) return;

        setState({
          discoveredFeeder: {
            chipId,
            host: service.host,
            port: service.port || 1883,
          },
          isScanning: false,
          error: null,
        });
        zeroconf.stop();
      },
    );

    zeroconf.on("error", (err: Error) => {
      setState((prev) => ({
        ...prev,
        isScanning: false,
        error: err?.message || "mDNS scan failed",
      }));
    });

    zeroconf.scan("mqtt", "tcp", "local.");
  }, [targetChipId]);

  const stopScan = useCallback(() => {
    if (zeroconfRef.current) {
      zeroconfRef.current.stop();
      zeroconfRef.current = null;
    }
    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (zeroconfRef.current) {
        zeroconfRef.current.stop();
      }
    };
  }, []);

  return { ...state, startScan, stopScan };
}
```

**Commit:**

```bash
git add hooks/useMDNS.ts
git commit -m "feat: add useMDNS hook for local feeder discovery"
```

---

### Task 2.3: Modify useMQTT to connect to discovered IP

**Files:**

- Modify: `hooks/useMQTT.ts`

**Changes:**

1. Remove the `BROKER_URL` constant (lines 11-12).
2. Change `connect()` signature to accept a `brokerUrl: string` parameter instead of a `chipId` override.
3. Replace `mqtt.connect(BROKER_URL, ...)` with `mqtt.connect(brokerUrl, ...)`.
4. Remove TLS-specific options (`rejectUnauthorized: false` is no longer needed for plaintext).
5. Change connection logic: the caller passes `mqtt://{host}:{port}` resolved from mDNS.

```ts
// OLD (remove):
const DEFAULT_BROKER_URL = "mqtts://broker.hivemq.com:8883";
const BROKER_URL =
  process.env.EXPO_PUBLIC_MQTT_BROKER_URL || DEFAULT_BROKER_URL;

// NEW:
const connect = useCallback((brokerUrl: string, chipId?: string) => {
  if (!brokerUrl) {
    setState((prev) => ({
      ...prev,
      error: "No feeder discovered yet",
      isConnecting: false,
    }));
    return;
  }

  const resolvedChipId = chipId ?? chipIdRef.current;
  if (!resolvedChipId) {
    /* error */ return;
  }

  // ... existing disconnect logic ...

  const client = mqtt.connect(brokerUrl, {
    clientId: `floyd-app-${Date.now().toString(36)}`,
    clean: true,
    keepalive: 30,
    connectTimeout: 10000, // shorter timeout for LAN
    reconnectPeriod: 3000,
    timerVariant: "native",
    // no TLS for local LAN
  });

  // ... rest of event handlers unchanged ...
}, []);
```

Also update the returned interface — `brokerUrl` changes from a static string to the current connection URL.

**Commit:**

```bash
git add hooks/useMQTT.ts
git commit -m "feat: modify useMQTT to connect to mDNS-discovered IP"
```

---

### Task 2.4: Rewrite useESP32Context for mDNS + new lifecycle

**Files:**

- Modify: `hooks/useESP32Context.tsx`

**Changes:**

1. Import `useMDNS` hook.
2. Add mDNS integration: when `chipId` is set, start mDNS scan. When a feeder is discovered, call `mqttConnect(mqtt://{host}:{port}, chipId)`.
3. Remove `brokerUrl` from context (dynamic now, not static).
4. Remove `proxyConnected` from `ESP32Data`.
5. Add feed log accumulator: on `control_response` with `feed_complete`, append to a feed log array.
6. Add feed log persistence to AsyncStorage key `floyd-feedlogs`.
7. Expose `feedLogs` and `schedules` in context.
8. Add `publishScheduleSync` method for full-sync schedule updates.
9. Listen for `schedules_list` response type in `handleMessage`.

```ts
// Key additions to context:
interface ESP32ContextType {
  // ... existing ...
  feedLogs: FeedLogEntry[];
  setFeedLogs: (logs: FeedLogEntry[]) => void;
  publishScheduleSync: (schedules: Schedule[]) => Promise<boolean>;
}

// In the provider:
const {
  discoveredFeeder,
  isScanning: isMdnsScanning,
  startScan,
  stopScan,
} = useMDNS(chipId);

// When feeder discovered:
useEffect(() => {
  if (discoveredFeeder && chipId) {
    const brokerUrl = `mqtt://${discoveredFeeder.host}:${discoveredFeeder.port}`;
    mqttConnect(brokerUrl, chipId);
  }
}, [discoveredFeeder, chipId]);
```

**Commit:**

```bash
git add hooks/useESP32Context.tsx
git commit -m "feat: integrate mDNS discovery and feed log persistence into ESP32Context"
```

---

### Task 2.5: Create useScheduleMQTT hook

**Files:**

- Create: `hooks/useScheduleMQTT.ts`

A hook that:

1. Calls `publishCommand("get_schedules")` on connect.
2. Listens for `schedules_list` MQTT response.
3. Stores schedules in local React state.
4. Provides `setSchedules(schedules)` which publishes `set_schedules` to ESP32.

```ts
import { useCallback, useEffect, useState } from "react";
import { useESP32 } from "./useESP32Context";

export interface Schedule {
  id: string;
  label: string;
  time: string; // "HH:MM"
  daysOfWeek: string; // "0,1,2,3,4,5,6"
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
  enabled: boolean;
}

export function useScheduleMQTT() {
  const { isConnected, publishCommand, deviceData, chipId } = useESP32();
  const [schedules, setSchedulesLocal] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(() => {
    if (!isConnected) return;
    setLoading(true);
    publishCommand("get_schedules");
  }, [isConnected, publishCommand]);

  const pushSchedules = useCallback(
    async (newSchedules: Schedule[]) => {
      if (!isConnected) {
        setError("Not connected to feeder");
        return false;
      }
      setLoading(true);
      const ok = publishCommand("set_schedules", { schedules: newSchedules });
      if (ok) {
        setSchedulesLocal(newSchedules);
      }
      setLoading(false);
      return ok;
    },
    [isConnected, publishCommand],
  );

  // Listen for schedules_list in deviceData
  useEffect(() => {
    // The ESP32Response handler in useESP32Context will set deviceData.schedules
    if ((deviceData as any)?.schedules) {
      setSchedulesLocal((deviceData as any).schedules);
      setLoading(false);
    }
  }, [deviceData]);

  // Fetch on connect
  useEffect(() => {
    if (isConnected) {
      fetchSchedules();
    }
  }, [isConnected, fetchSchedules]);

  return { schedules, loading, error, fetchSchedules, pushSchedules };
}
```

**Commit:**

```bash
git add hooks/useScheduleMQTT.ts
git commit -m "feat: add useScheduleMQTT hook for schedule CRUD over MQTT"
```

---

## Phase 3: App — Screen Rewrites

### Task 3.1: Rewrite ESP32Connection for LAN

**Files:**

- Modify: `components/ESP32Connection.tsx`

Replace entirely. The component becomes:

**Disconnected state (no chipId):**

- Title: "Feeder Connection" (icon: `antenna.radiowaves.left.and.right`)
- Message: "No feeder configured"
- Button: "Set Up Feeder" → opens `/provision`

**Scanning state:**

- Title: "Searching..."
- Spinner + "Looking for Floyd Feeder on your WiFi..."
- "Make sure it's plugged in and on the same network"

**Connected state:**

- Title: "Connected" with green dot
- Shows chipId and IP/hostname
- Buttons: Disconnect, Reconfigure (factory reset)

Remove all cloud language ("Floyd Feeder Cloud", globe icon, MQTT broker URL, "check your internet connection").

**Commit:**

```bash
git add components/ESP32Connection.tsx
git commit -m "feat: rewrite ESP32Connection for LAN-only UI"
```

---

### Task 3.2: Update Dashboard screen

**Files:**

- Modify: `app/(tabs)/index.tsx`

**Changes:**

1. Replace "Cloud connection: Online" → "Feeder: Online" / "Feeder: Offline"
2. Replace "Cloud online, feeder offline" → "Feeder not responding"
3. Remove the "Device Status" card with separate Cloud/Feeder rows. Merge into a single connection status display.
4. `esp32Status` logic simplified: `esps32Status === "connected"` → `isConnected` (binary).
5. Update `helpBox` text from "The cloud is connected, but the feeder is not responding" → "The feeder was found on the network but is not responding. Check power."

**Commit:**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: update dashboard for LAN-only status model"
```

---

### Task 3.3: Update Controls screen

**Files:**

- Modify: `app/(tabs)/controls.tsx`

**Changes:**

1. Replace "Not connected to cloud server." → "Not connected to feeder."
2. Replace "Connected to cloud, but the feeder is offline." → "Feeder is offline — check power & WiFi."
3. Remove `esp32Status` checks — just gate on `isConnected`.
4. Remove `hardwareOffline` concept (collapsed into `!isConnected`).

**Commit:**

```bash
git add app/(tabs)/controls.tsx
git commit -m "feat: update controls screen for LAN-only mode"
```

---

### Task 3.4: Rewrite Schedule screen to use MQTT

**Files:**

- Modify: `app/(tabs)/schedule.tsx`

**Changes:**

1. Remove the hardcoded `CLOUD_SERVER` constant.
2. Remove the inline `fetchSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule` functions that call REST.
3. Import and use `useScheduleMQTT()` hook.
4. The schedule data model changes slightly: the ESP32 uses `id` (hex string) not `_id` (MongoDB-style). Map `_id` ↔ `id` or unify on `id`.
5. `handleSave` calls `pushSchedules(schedules)` instead of `fetch(CLOUD_SERVER + '/api/schedules', ...)`.
6. `handleToggleEnabled` and `handleDelete` work on local state, then push the full array.
7. Replace `loadSchedules` with `fetchSchedules` from the hook.

**Commit:**

```bash
git add app/(tabs)/schedule.tsx
git commit -m "feat: rewrite schedule screen to use MQTT full-sync"
```

---

### Task 3.5: Rewrite History screen to use AsyncStorage

**Files:**

- Modify: `app/(tabs)/history.tsx`

**Changes:**

1. Remove the hardcoded `CLOUD_SERVER` constant.
2. Remove `fetchFeedHistory` — it calls `fetch(CLOUD_SERVER + '/api/history')`.
3. Import feed logs from `useESP32()`. The context now exposes `feedLogs`.
4. The feed logs array is populated from AsyncStorage on mount and updated on each `feed_complete` event.
5. `handleFeedHistoryToggle` no longer calls `fetchFeedHistory` — just toggles visibility of already-loaded data.

```ts
const { feedLogs } = useESP32();

// Replace fetchFeedHistory with:
const handleFeedHistoryToggle = () => {
  setShowFeedHistory(!showFeedHistory);
};
```

**Commit:**

```bash
git add app/(tabs)/history.tsx
git commit -m "feat: rewrite history screen to use AsyncStorage feed logs"
```

---

### Task 3.6: Simplify provision screen

**Files:**

- Modify: `app/provision.tsx`

**Changes:**

1. Remove `import { claimDevice } from "@/services/api"`.
2. Remove `finishClaim` and the entire "claiming" step.
3. After provisioning is detected complete (WebView JS detects success text), skip the claim step and go directly to "done".
4. Remove MQTT password storage (`AsyncStorage.setItem("floydMqttPassword", ...)` — nothing to store now).
5. Remove `restart_provisioning` handler's password cleanup.
6. On "done", navigate to dashboard with `setChipId(deviceId)`.

```ts
// OLD flow: provisioning → claiming → done
// NEW flow: provisioning → done

if (data.type === "provisioning-complete") {
  const cId = data.chipId;
  if (cId) {
    await AsyncStorage.setItem("floydChipId", cId);
    setChipId(cId);
    setStep("done");
  }
}
```

**Commit:**

```bash
git add app/provision.tsx
git commit -m "feat: simplify provision screen — no cloud claim step"
```

---

## Phase 4: Cleanup

### Task 4.1: Delete cloud server

**Files:**

- Delete: `server/` (entire directory)
- Delete: `patches/@prisma+react-native+6.0.1.patch`

```bash
rm -rf server/
rm -f patches/@prisma+react-native+6.0.1.patch
```

**Commit:**

```bash
git add -A
git commit -m "chore: delete cloud server and Prisma patch"
```

---

### Task 4.2: Delete services/api.ts

**Files:**

- Delete: `services/api.ts`

```bash
rm services/api.ts
```

**Commit:**

```bash
git add services/api.ts
git commit -m "chore: delete cloud REST API client"
```

---

### Task 4.3: Clean up package.json

**Files:**

- Modify: `package.json`

Remove server-only dependencies:

- `@prisma/client`
- `@prisma/react-native`
- `prisma` (devDep)
- `@types/express` (devDep)
- `@types/ws`
- `@types/node` (if only used by server)

```bash
npm uninstall @prisma/client @prisma/react-native
npm uninstall --save-dev prisma @types/express @types/ws
```

Verify app still builds: `npx tsc --noEmit`

**Commit:**

```bash
git add package.json package-lock.json
git commit -m "chore: remove server-only npm dependencies"
```

---

### Task 4.4: Clean up .env files

**Files:**

- Modify: `.env`
- Modify: `.env.example`

Remove:

- `EXPO_PUBLIC_MQTT_BROKER_URL`
- `EXPO_PUBLIC_API_URL`

Replace with a single comment:

```
# Floyd Feeder — Local WiFi Mode
# No cloud environment variables needed.
# The app discovers the feeder automatically via mDNS.
```

**Commit:**

```bash
git add .env .env.example
git commit -m "chore: remove cloud env vars"
```

---

### Task 4.5: Remove cloud alarm references in useAlerts

**Files:**

- Modify: `hooks/useAlerts.ts`

No functional changes needed — `DEFAULT_THRESHOLDS` is already hardcoded (Q13). Just verify no cloud API calls exist.

---

## Phase 5: Documentation

### Task 5.1: Update codebase.md

**Files:**

- Modify: `codebase.md`

Update:

1. Architecture diagram — remove Cloud block, show App ↔ ESP32 directly
2. Remove Cloud Infrastructure section
3. Update Data Flow — remove server references
4. Update REST API section → "Schedule CRUD via MQTT"
5. Update Deployment section — remove Railway, add "ESP32: Flash via Arduino IDE, no cloud configuration needed"
6. Update Environment section

**Commit:**

```bash
git add codebase.md
git commit -m "docs: update codebase.md for local WiFi architecture"
```

---

### Task 5.2: Update README.md

**Files:**

- Modify: `README.md`

Update:

1. Tagline: "Control your fish feeder from your phone on the same WiFi."
2. Architecture diagram — local only
3. Remove Cloud Server and MQTT Broker from Components table
4. Update Quick Start — no server to run
5. Remove server deployment instructions
6. Update env vars section — none needed

**Commit:**

```bash
git add README.md
git commit -m "docs: update README for local WiFi mode"
```

---

## Implementation Order

```
Phase 1: ESP32 Firmware
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7
  (1.3 depends on 1.1 for mDNS; 1.4 depends on 1.2 for NTP; 1.5 depends on 1.4)

Phase 2: App Infrastructure
  2.1 → 2.2 → 2.3 → 2.4 → 2.5
  (Each depends on previous)

Phase 3: App Screens
  3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
  (Can be parallelized after 2.4 is done)

Phase 4: Cleanup
  4.1 → 4.2 → 4.3 → 4.4 → 4.5
  (Independent, order doesn't matter)

Phase 5: Documentation
  5.1 → 5.2
  (Independent)
```

---

## Testing Checklist

After each phase, verify:

### Phase 1 (ESP32):

- [ ] ESP32 boots, connects to WiFi
- [ ] mDNS service visible: `dns-sd -B _mqtt._tcp local.` shows `floyd-feeder-{chipId}`
- [ ] NTP time syncs: ESP32 serial shows correct time
- [ ] Schedules persist across reboots (check serial output)
- [ ] WiFiManager portal shows only WiFi fields (no MQTT)

### Phase 2 (App):

- [ ] `npm run start` compiles without errors
- [ ] mDNS discovers feeder on same WiFi
- [ ] MQTT connects to discovered IP

### Phase 3 (Screens):

- [ ] Dashboard shows connection status without cloud language
- [ ] Controls screen: FEED button works over local MQTT
- [ ] Schedule screen: schedules load from ESP32, save to ESP32
- [ ] History screen: feed logs appear from AsyncStorage
- [ ] Provision screen: completes without cloud claim step

### Phase 4 (Cleanup):

- [ ] `npx tsc --noEmit` passes
- [ ] `npx expo start` runs
- [ ] No references to `CLOUD_SERVER`, `HiveMQ`, `Railway` in codebase

### Phase 5 (Docs):

- [ ] Codebase.md architecture diagram shows local-only
- [ ] README quick start doesn't mention server
