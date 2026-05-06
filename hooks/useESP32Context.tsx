import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AppState } from "react-native";
import { makeLocalId } from "../utils/localId";
import { useBLEDiscovery } from "./useBLEDiscovery";
import { useBLETransport } from "./useBLETransport";
import type { BLEMessage } from "./transportTypes";
import type {
	ConnectionState,
	ConnectionError,
	ConnectionErrorKind,
	DiscoveredFeederBle,
} from "./transportTypes";

// ── types ────────────────────────────────────────────────────────────────────

interface FeederConfig {
	cylinderRadius: number;
	cylinderHeight: number;
	frustumTopRadius: number;
	frustumBottomRadius: number;
	frustumHeight: number;
	totalVolumeCm3: number;
	defaultPreSpinMs: number;
	defaultPostSpinMs: number;
	defaultFeedMs: number;
}

interface ESP32Data {
	temperature?: number;
	temperatureSensorConnected?: boolean;
	ultrasonicSensorConnected?: boolean;
	distance?: number;
	foodLevelPercentage?: number;
	motorState?: "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear";
	augerSpeed?: number;
	impellerSpeed?: number;
	wifiRssi?: number;
	feederConfig?: FeederConfig;
	lastUpdate?: number;
	esp32Connected?: boolean;
	schedules?: Schedule[];
}

interface FeedLogEntry {
	id: string;
	timestamp: string;
	augerSpeed: number;
	impellerSpeed: number;
	feedMs: number;
	success: boolean;
	errorMessage?: string;
}

export interface SensorLogEntry {
	id: string;
	timestamp: Date;
	temperature?: number;
	distance?: number;
	foodLevel?: number;
	temperatureSensorConnected: boolean;
	ultrasonicSensorConnected: boolean;
}

const MAX_SENSOR_LOG_ENTRIES = 50;

interface Schedule {
	id: string;
	label: string;
	time: string;
	daysOfWeek: string;
	augerSpeed: number;
	impellerSpeed: number;
	preSpinMs: number;
	feedMs: number;
	postSpinMs: number;
	enabled: boolean;
}

interface FeedParams {
	augerSpeed: number;
	impellerSpeed: number;
	preSpinMs: number;
	feedMs: number;
	postSpinMs: number;
}

// ── scan timeout & reconnect limits ────────────────────────────────────────

const SCAN_TIMEOUT_MS = 15000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_TOTAL_TIMEOUT_MS = 30000;

// ── context type ────────────────────────────────────────────────────────────

export interface ESP32ContextType {
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;
	deviceData: ESP32Data;
	chipId: string | null;

	/** Top-level connection state machine. */
	connectionState: ConnectionState;
	/** True if we were previously connected (differentiates first-connect-fail from disconnect). */
	wasConnected: boolean;
	/** Structured error when connectionState === "error". */
	connectionError: ConnectionError | null;
	/** Milliseconds since entering scanning/connecting state, for tiered timeout UI. */
	connectionElapsedMs: number;

	publishCommand: (action: string, parameters?: object) => boolean;
	startFeed: (params: FeedParams) => void;
	stopFeed: () => void;
	clearJam: (speed?: number, duration?: number) => void;
	setSensorReadingInterval: (interval: number) => boolean;
	requestSensorData: () => boolean;
	reloadSchedules: () => Promise<boolean>;
	publishScheduleSync: (schedules: Schedule[]) => Promise<boolean>;

	isAutoRefreshEnabled: boolean;
	setAutoRefreshEnabled: (enabled: boolean) => void;
	autoRefreshInterval: number;
	setAutoRefreshInterval: (interval: number) => void;

	esp32Status: "connected" | "disconnected" | "unknown";
	feedLogs: FeedLogEntry[];
	setFeedLogs: (logs: FeedLogEntry[]) => void;
	sensorLogs: SensorLogEntry[];
	clearSensorLogs: () => void;

	/** Discovered BLE devices (for scan UI). */
	bleDevices: DiscoveredFeederBle[];
	isBleScanning: boolean;
	bleDiscoveryError: string | null;
	bleRssi: number | null;

	// ── new explicit state machine actions ─────────────────────────────────
	/** Begin the scan→connect pipeline for the stored chipId. */
	startConnection: () => void;
	/** User selects a device from the scan list. */
	connectToDevice: (deviceId: string, feederChipId: string) => void;
	/** Retry from error state. */
	retryConnection: () => void;
	/** Forget stored feeder — clear chipId, disconnect, return to idle. */
	forgetFeeder: () => void;
	/** Manual disconnect (transitions to idle, not auto-reconnect). */
	disconnectBle: () => void;
}

const ESP32Context = createContext<ESP32ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 10000;

// ── helpers ─────────────────────────────────────────────────────────────────

function makeConnectionError(
	kind: ConnectionErrorKind,
	message: string,
): ConnectionError {
	return { kind, message };
}

// ── provider ────────────────────────────────────────────────────────────────

interface ESP32ProviderProps {
	children: ReactNode;
	initialChipId?: string | null;
}

export const ESP32Provider: React.FC<ESP32ProviderProps> = ({
	children,
	initialChipId = null,
}) => {
	// ── state ─────────────────────────────────────────────────────────────
	const [chipId, setChipIdState] = useState<string | null>(initialChipId);
	const [connectionState, setConnectionState] =
		useState<ConnectionState>("idle");
	const [wasConnected, setWasConnected] = useState(false);
	const [connectionError, setConnectionError] =
		useState<ConnectionError | null>(null);
	const [connectionElapsedMs, setConnectionElapsedMs] = useState(0);

	const [deviceData, setDeviceData] = useState<ESP32Data>({});
	const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
	const [autoRefreshInterval, setAutoRefreshInterval] = useState(
		DEFAULT_AUTO_REFRESH_INTERVAL,
	);
	const [feedLogs, setFeedLogsState] = useState<FeedLogEntry[]>([]);
	const [sensorLogs, setSensorLogs] = useState<SensorLogEntry[]>([]);

	const feedLogJournalRef = useRef<FeedLogEntry[]>([]);
	const stateEntryTimeRef = useRef<number>(0);
	const reconnectCountRef = useRef(0);
	const reconnectStartTimeRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const persistFeedLogsRef = useRef(() => {});
	persistFeedLogsRef.current = () => {
		const logs = feedLogJournalRef.current;
		if (logs.length > 0) {
			AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(
				(err) => console.error("Failed to persist feed logs:", err),
			);
		}
	};

	useEffect(() => {
		feedLogJournalRef.current = feedLogs;
	}, [feedLogs]);

	// ── elapsed timer ─────────────────────────────────────────────────────
	const startElapsedTimer = useCallback(() => {
		stateEntryTimeRef.current = Date.now();
		setConnectionElapsedMs(0);
		timerRef.current = setInterval(() => {
			setConnectionElapsedMs(Date.now() - stateEntryTimeRef.current);
		}, 1000);
	}, []);

	const stopElapsedTimer = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	// cleanup timer on unmount
	useEffect(() => {
		return () => stopElapsedTimer();
	}, [stopElapsedTimer]);

	// ── BLE discovery ─────────────────────────────────────────────────────
	const bleDiscovery = useBLEDiscovery();
	const {
		devices: bleDevices,
		isScanning: isBleScanning,
		error: bleDiscoveryError,
		startScan: startBleScan,
		stopScan: stopBleScan,
		clearDiscovered: clearBleDiscovered,
	} = bleDiscovery;

	// ── message handler (unchanged logic) ─────────────────────────────────
	const handleMessage = useCallback((message: BLEMessage) => {
		switch (message.type) {
			case "sensor_data": {
				const d = message.data as Record<string, unknown>;
				setDeviceData((prev) => ({
					...prev,
					temperature: (d.temperature as number) ?? prev.temperature,
					distance: (d.distance as number) ?? prev.distance,
					foodLevelPercentage:
						(d.foodLevelPercentage as number) ?? prev.foodLevelPercentage,
					temperatureSensorConnected:
						(d.temperatureSensorConnected as boolean) ??
						prev.temperatureSensorConnected,
					ultrasonicSensorConnected:
						(d.ultrasonicSensorConnected as boolean) ??
						prev.ultrasonicSensorConnected,
					motorState:
						(d.motorState as ESP32Data["motorState"]) ||
						prev.motorState ||
						"idle",
					augerSpeed: (d.augerSpeed as number) ?? prev.augerSpeed,
					impellerSpeed: (d.impellerSpeed as number) ?? prev.impellerSpeed,
					lastUpdate: message.timestamp,
					esp32Connected: true,
				}));
				break;
			}
			case "control_response": {
				const d = message.data as Record<string, unknown>;
				setDeviceData((prev) => ({
					...prev,
					motorState:
						(d.motorState as ESP32Data["motorState"]) ?? prev.motorState,
					lastUpdate: message.timestamp,
					esp32Connected: true,
				}));

				if (d.action === "feed_complete") {
					const newEntry: FeedLogEntry = {
						id: makeLocalId(),
						timestamp: new Date().toISOString(),
						augerSpeed: typeof d.augerSpeed === "number" ? d.augerSpeed : 768,
						impellerSpeed:
							typeof d.impellerSpeed === "number" ? d.impellerSpeed : 1023,
						feedMs: typeof d.feedMs === "number" ? d.feedMs : 3000,
						success: (d.success as boolean) !== false,
					};
					setFeedLogsState((prev) => {
						const next = [newEntry, ...prev].slice(0, 100);
						return next;
					});
					persistFeedLogsRef.current();
				}
				break;
			}
			case "status": {
				const d = message.data as Record<string, unknown>;
				setDeviceData((prev) => ({
					...prev,
					feederConfig: (d.feederConfig as FeederConfig) ?? prev.feederConfig,
					wifiRssi: (d.wifiRssi as number) ?? prev.wifiRssi,
					lastUpdate: message.timestamp,
					esp32Connected: (d.connected as boolean) !== false,
				}));
				break;
			}
			case "schedules_list": {
				const raw = message.data;
				setDeviceData((prev) => ({
					...prev,
					schedules: Array.isArray(raw) ? (raw as Schedule[]) : prev.schedules,
					lastUpdate: message.timestamp,
				}));
				break;
			}
			case "error":
				console.error("Device error:", message.data);
				break;
		}
	}, []);

	// ── BLE disconnect handler ─────────────────────────────────────────────
	const handleBleDisconnect = useCallback(
		(_reason: string | null) => {
			// Don't clear deviceData — keep frozen values.
			setWasConnected(true);

			const now = Date.now();
			const elapsed = reconnectStartTimeRef.current
				? now - reconnectStartTimeRef.current
				: 0;

			// Start reconnect window on first disconnect
			if (reconnectCountRef.current === 0) {
				reconnectStartTimeRef.current = now;
			}
			reconnectCountRef.current += 1;

			if (
				reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS &&
				elapsed < RECONNECT_TOTAL_TIMEOUT_MS
			) {
				// Auto-reconnect: go back to scanning
				setConnectionState("scanning");
				startElapsedTimer();
				void startBleScan();
			} else {
				// Give up — escalate to error
				setConnectionState("error");
				stopElapsedTimer();
				setConnectionError(
					makeConnectionError(
						"connection_lost",
						"Connection lost after multiple reconnect attempts. Make sure the feeder is powered on and nearby.",
					),
				);
				void stopBleScan();
			}
		},
		[startBleScan, stopBleScan, startElapsedTimer, stopElapsedTimer],
	);

	// ── BLE transport ─────────────────────────────────────────────────────
	const ble = useBLETransport({
		onMessage: handleMessage,
		onDisconnect: handleBleDisconnect,
	});

	// ── auto-connect scan → connect pipeline ──────────────────────────────
	// When scanning with a chipId, auto-connect when the device appears.
	useEffect(() => {
		if (connectionState !== "scanning" || !chipId) return;
		const match = bleDevices.find(
			(d) => d.chipId.toUpperCase() === chipId.toUpperCase(),
		);
		if (match) {
			void stopBleScan();
			if (scanTimeoutRef.current) {
				clearTimeout(scanTimeoutRef.current);
				scanTimeoutRef.current = null;
			}
			setConnectionState("connecting");
			startElapsedTimer();
			void ble.connect(match.deviceId).then(() => {
				// After connect attempt, check if we're connected
				// The isConnected state is managed inside useBLETransport
			});
		}
	}, [
		connectionState,
		chipId,
		bleDevices,
		ble.connect,
		stopBleScan,
		startElapsedTimer,
	]);

	// ── react to BLE transport connection state changes ───────────────────
	const prevBleConnectedRef = useRef(false);
	useEffect(() => {
		const wasConnected = prevBleConnectedRef.current;
		prevBleConnectedRef.current = ble.isConnected;

		if (ble.isConnected && connectionState === "connecting") {
			// Connection succeeded
			setConnectionState("connected");
			stopElapsedTimer();
			setConnectionError(null);
			setWasConnected(true);
			reconnectCountRef.current = 0;
			reconnectStartTimeRef.current = 0;
			// Sync time on connect
			const ts = Math.floor(Date.now() / 1000);
			void ble.syncTime(ts);
		}

		if (!ble.isConnected && wasConnected && connectionState === "connected") {
			// Disconnected — handled by onDisconnect callback already
		}
	}, [ble.isConnected, connectionState, ble.syncTime, stopElapsedTimer]);

	// ── time sync on app foreground ───────────────────────────────────────
	useEffect(() => {
		const sub = AppState.addEventListener("change", (s) => {
			if (s === "active" && connectionState === "connected") {
				void ble.syncTime(Math.floor(Date.now() / 1000));
			}
		});
		return () => sub.remove();
	}, [connectionState, ble.syncTime]);

	// ── sensor log accumulation ───────────────────────────────────────────
	useEffect(() => {
		const lastUpdate = deviceData.lastUpdate;
		if (connectionState !== "connected" || lastUpdate === undefined) return;
		setSensorLogs((prev) => {
			const lastEntry = prev[0];
			if (lastEntry?.timestamp.getTime() === lastUpdate) {
				return prev;
			}
			const newLogEntry: SensorLogEntry = {
				id: Date.now().toString(),
				timestamp: new Date(),
				temperature: deviceData.temperature,
				distance: deviceData.distance,
				foodLevel: deviceData.foodLevelPercentage,
				temperatureSensorConnected:
					deviceData.temperatureSensorConnected ?? false,
				ultrasonicSensorConnected:
					deviceData.ultrasonicSensorConnected ?? false,
			};
			return [newLogEntry, ...prev].slice(0, MAX_SENSOR_LOG_ENTRIES);
		});
	}, [
		connectionState,
		deviceData.lastUpdate,
		deviceData.temperature,
		deviceData.distance,
		deviceData.foodLevelPercentage,
		deviceData.temperatureSensorConnected,
		deviceData.ultrasonicSensorConnected,
	]);

	// ── scan timeout ──────────────────────────────────────────────────────
	useEffect(() => {
		if (connectionState === "scanning") {
			scanTimeoutRef.current = setTimeout(() => {
				if (bleDevices.length === 0) {
					setConnectionState("error");
					stopElapsedTimer();
					setConnectionError(
						makeConnectionError(
							"no_devices",
							"No Floyd feeders found nearby. Make sure the feeder is powered on and within range.",
						),
					);
					void stopBleScan();
				}
			}, SCAN_TIMEOUT_MS);
		}
		return () => {
			if (scanTimeoutRef.current) {
				clearTimeout(scanTimeoutRef.current);
				scanTimeoutRef.current = null;
			}
		};
	}, [connectionState, bleDevices.length, stopBleScan, stopElapsedTimer]);

	// ── connect timeout (connecting state) ────────────────────────────────
	const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (connectionState === "connecting") {
			connectTimeoutRef.current = setTimeout(() => {
				// If still connecting after 20s, give up
				setConnectionState("error");
				stopElapsedTimer();
				setConnectionError(
					makeConnectionError(
						"connection_failed",
						"Could not connect to the feeder. Make sure it's powered on and nearby.",
					),
				);
			}, 20000);
		}
		return () => {
			if (connectTimeoutRef.current) {
				clearTimeout(connectTimeoutRef.current);
				connectTimeoutRef.current = null;
			}
		};
	}, [connectionState, stopElapsedTimer]);

	// ── startConnection ───────────────────────────────────────────────────
	const startConnection = useCallback(() => {
		stopElapsedTimer();
		setConnectionError(null);
		setConnectionState("scanning");
		startElapsedTimer();
		void startBleScan();
	}, [startBleScan, startElapsedTimer, stopElapsedTimer]);

	// ── connectToDevice (user picks from list) ────────────────────────────
	const connectToDevice = useCallback(
		(deviceId: string, feederChipId: string) => {
			setChipIdState(feederChipId);
			AsyncStorage.setItem("floydChipId", feederChipId).catch(console.error);
			void stopBleScan();
			setConnectionState("connecting");
			startElapsedTimer();
			setConnectionError(null);
			void ble.connect(deviceId);
		},
		[ble.connect, stopBleScan, startElapsedTimer],
	);

	// ── retryConnection (from error state) ────────────────────────────────
	const retryConnection = useCallback(() => {
		reconnectCountRef.current = 0;
		reconnectStartTimeRef.current = 0;
		setWasConnected(false);
		startConnection();
	}, [startConnection]);

	// ── forgetFeeder ──────────────────────────────────────────────────────
	const forgetFeeder = useCallback(() => {
		stopElapsedTimer();
		setChipIdState(null);
		AsyncStorage.removeItem("floydChipId").catch(console.error);
		void ble.disconnect();
		void stopBleScan();
		clearBleDiscovered();
		setConnectionState("idle");
		setConnectionError(null);
		setWasConnected(false);
		reconnectCountRef.current = 0;
		reconnectStartTimeRef.current = 0;
		// Don't clear deviceData — the dashboard can show last-known values
	}, [ble.disconnect, stopBleScan, clearBleDiscovered, stopElapsedTimer]);

	// ── disconnectBle (manual disconnect, no reconnect) ───────────────────
	const disconnectBle = useCallback(() => {
		stopElapsedTimer();
		void ble.disconnect();
		void stopBleScan();
		setConnectionState("idle");
		setConnectionError(null);
		setWasConnected(false);
		reconnectCountRef.current = 0;
		reconnectStartTimeRef.current = 0;
	}, [ble.disconnect, stopBleScan, stopElapsedTimer]);

	// ── derived convenience booleans ─────────────────────────────────────
	const isConnected = connectionState === "connected";
	const isConnecting = connectionState === "connecting";

	const error =
		connectionError?.message ?? ble.error ?? bleDiscoveryError ?? null;

	// ── command publishing ───────────────────────────────────────────────
	const publishCommand = useCallback(
		(action: string, parameters?: object): boolean => {
			const payload = { action, parameters, timestamp: Date.now() };
			if (ble.isConnected) {
				void ble.writeCommandPayload(payload);
				return true;
			}
			return false;
		},
		[ble.isConnected, ble.writeCommandPayload],
	);

	const requestSensorData = useCallback((): boolean => {
		return publishCommand("get_sensors");
	}, [publishCommand]);

	const startFeed = useCallback(
		(params: FeedParams) => {
			if (!isConnected) return;
			publishCommand("start_feed", params);
		},
		[isConnected, publishCommand],
	);

	const stopFeed = useCallback(() => {
		if (!isConnected) return;
		publishCommand("stop_feed");
	}, [isConnected, publishCommand]);

	const clearJam = useCallback(
		(speed?: number, duration?: number) => {
			if (!isConnected) return;
			publishCommand("clear_jam", {
				speed: speed || 768,
				duration: duration || 2000,
			});
		},
		[isConnected, publishCommand],
	);

	const setSensorReadingInterval = useCallback(
		(interval: number): boolean => {
			return publishCommand("set_sensor_interval", { interval });
		},
		[publishCommand],
	);

	const setFeedLogs = useCallback((logs: FeedLogEntry[]) => {
		setFeedLogsState(logs);
		AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(
			console.error,
		);
	}, []);

	const clearSensorLogs = useCallback(() => {
		setSensorLogs([]);
	}, []);

	const publishScheduleSync = useCallback(
		async (schedules: Schedule[]): Promise<boolean> => {
			if (ble.isConnected) {
				return await ble.writeSchedulesChunked(schedules as unknown[]);
			}
			return false;
		},
		[ble.isConnected, ble.writeSchedulesChunked],
	);

	const reloadSchedules = useCallback(async (): Promise<boolean> => {
		if (ble.isConnected) {
			const list = await ble.readSchedulesFromCharacteristic();
			if (list !== null) {
				handleMessage({
					type: "schedules_list",
					data: list,
					timestamp: Date.now(),
				});
				return true;
			}
			return false;
		}
		return false;
	}, [ble.isConnected, ble.readSchedulesFromCharacteristic, handleMessage]);

	const esp32Status: "connected" | "disconnected" | "unknown" =
		deviceData.esp32Connected === true
			? "connected"
			: deviceData.esp32Connected === false
				? "disconnected"
				: "unknown";

	// ── context value ─────────────────────────────────────────────────────
	const contextValue: ESP32ContextType = useMemo(
		() => ({
			isConnected,
			isConnecting,
			error,
			deviceData,
			chipId,
			connectionState,
			wasConnected,
			connectionError,
			connectionElapsedMs,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			reloadSchedules,
			publishScheduleSync,
			isAutoRefreshEnabled,
			setAutoRefreshEnabled,
			autoRefreshInterval,
			setAutoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			sensorLogs,
			clearSensorLogs,
			bleDevices,
			isBleScanning,
			bleDiscoveryError,
			bleRssi: ble.bleRssi,
			startConnection,
			connectToDevice,
			retryConnection,
			forgetFeeder,
			disconnectBle,
		}),
		[
			isConnected,
			isConnecting,
			error,
			deviceData,
			chipId,
			connectionState,
			wasConnected,
			connectionError,
			connectionElapsedMs,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			reloadSchedules,
			publishScheduleSync,
			isAutoRefreshEnabled,
			autoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			sensorLogs,
			clearSensorLogs,
			bleDevices,
			isBleScanning,
			bleDiscoveryError,
			ble.bleRssi,
			startConnection,
			connectToDevice,
			retryConnection,
			forgetFeeder,
			disconnectBle,
		],
	);

	return (
		<ESP32Context.Provider value={contextValue}>
			{children}
		</ESP32Context.Provider>
	);
};

export const useESP32 = (): ESP32ContextType => {
	const context = useContext(ESP32Context);
	if (!context) {
		throw new Error("useESP32 must be used within an ESP32Provider");
	}
	return context;
};

export default ESP32Context;
