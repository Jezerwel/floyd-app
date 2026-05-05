import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
	createContext,
	ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMDNS } from "./useMDNS";
import useMQTT, { MQTTMessage } from "./useMQTT";

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

interface ESP32ContextType {
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;
	connectionAttempts: number;
	deviceData: ESP32Data;
	chipId: string | null;
	setChipId: (chipId: string | null) => void;
	connectionMode: "auto" | "direct-ap";
	setConnectionMode: (mode: "auto" | "direct-ap") => void;
	connect: () => void;
	disconnect: () => void;
	resetConnection: () => void;
	publishCommand: (action: string, parameters?: object) => boolean;
	startFeed: (params: FeedParams) => void;
	stopFeed: () => void;
	clearJam: (speed?: number, duration?: number) => void;
	setSensorReadingInterval: (interval: number) => boolean;
	requestSensorData: () => boolean;
	isAutoRefreshEnabled: boolean;
	setAutoRefreshEnabled: (enabled: boolean) => void;
	autoRefreshInterval: number;
	setAutoRefreshInterval: (interval: number) => void;
	esp32Status: "connected" | "disconnected" | "unknown";
	feedLogs: FeedLogEntry[];
	setFeedLogs: (logs: FeedLogEntry[]) => void;
	publishScheduleSync: (schedules: Schedule[]) => boolean;
}

const ESP32Context = createContext<ESP32ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 10000;

interface ESP32ProviderProps {
	children: ReactNode;
	initialChipId?: string | null;
}

export const ESP32Provider: React.FC<ESP32ProviderProps> = ({
	children,
	initialChipId = null,
}) => {
	const [chipId, setChipIdState] = useState<string | null>(initialChipId);
	const [connectionMode, setConnectionModeState] = useState<
		"auto" | "direct-ap"
	>("direct-ap");
	const [deviceData, setDeviceData] = useState<ESP32Data>({});
	const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
	const [autoRefreshInterval, setAutoRefreshInterval] = useState(
		DEFAULT_AUTO_REFRESH_INTERVAL,
	);
	const [feedLogs, setFeedLogsState] = useState<FeedLogEntry[]>([]);
	const feedLogJournalRef = useRef<FeedLogEntry[]>([]);

	// Debounced AsyncStorage flush for feed logs
	const persistFeedLogsRef = useRef(() => {
		// noop — assigned below after setFeedLogsState
	});
	persistFeedLogsRef.current = () => {
		const logs = feedLogJournalRef.current;
		if (logs.length > 0) {
			AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(
				(err) => console.error("Failed to persist feed logs:", err),
			);
		}
	};

	// Sync journal ref when feedLogs state updates
	useEffect(() => {
		feedLogJournalRef.current = feedLogs;
	}, [feedLogs]);

	// Load persisted connection mode
	useEffect(() => {
		AsyncStorage.getItem("floydConnectionMode")
			.then((val) => {
				if (val === "auto" || val === "direct-ap") {
					setConnectionModeState(val);
				}
			})
			.catch(() => {});
	}, []);

	const setConnectionMode = useCallback((mode: "auto" | "direct-ap") => {
		setConnectionModeState(mode);
		AsyncStorage.setItem("floydConnectionMode", mode).catch(console.error);
	}, []);

	const {
		discoveredFeeder,
		isScanning: _isMdnsScanning,
		startScan,
		stopScan: _stopScan,
	} = useMDNS(connectionMode === "auto" ? chipId : null);

	const handleMessage = useCallback((message: MQTTMessage) => {
		switch (message.type) {
			case "sensor_data":
				setDeviceData((prev) => ({
					...prev,
					temperature: (message.data.temperature as number) ?? prev.temperature,
					distance: (message.data.distance as number) ?? prev.distance,
					foodLevelPercentage:
						(message.data.foodLevelPercentage as number) ??
						prev.foodLevelPercentage,
					temperatureSensorConnected:
						(message.data.temperatureSensorConnected as boolean) ??
						prev.temperatureSensorConnected,
					ultrasonicSensorConnected:
						(message.data.ultrasonicSensorConnected as boolean) ??
						prev.ultrasonicSensorConnected,
					motorState:
						(message.data.motorState as ESP32Data["motorState"]) ||
						prev.motorState ||
						"idle",
					augerSpeed: (message.data.augerSpeed as number) ?? prev.augerSpeed,
					impellerSpeed:
						(message.data.impellerSpeed as number) ?? prev.impellerSpeed,
					lastUpdate: message.timestamp,
					esp32Connected: true,
				}));
				break;
			case "control_response": {
				setDeviceData((prev) => ({
					...prev,
					motorState:
						(message.data.motorState as ESP32Data["motorState"]) ??
						prev.motorState,
					lastUpdate: message.timestamp,
					esp32Connected: true,
				}));

				// Accumulate feed log on feed_complete
				if (message.data.action === "feed_complete") {
					const newEntry: FeedLogEntry = {
						id: Date.now().toString(36),
						timestamp: new Date().toISOString(),
						augerSpeed: (message.data.augerSpeed as number) || 768,
						impellerSpeed: (message.data.impellerSpeed as number) || 1023,
						feedMs: (message.data.feedMs as number) || 3000,
						success: (message.data.success as boolean) !== false,
					};
					setFeedLogsState((prev) => {
						const next = [newEntry, ...prev].slice(0, 100);
						return next;
					});
					persistFeedLogsRef.current();
				}
				break;
			}
			case "status":
				setDeviceData((prev) => ({
					...prev,
					feederConfig:
						(message.data.feederConfig as FeederConfig) ?? prev.feederConfig,
					wifiRssi: (message.data.wifiRssi as number) ?? prev.wifiRssi,
					lastUpdate: message.timestamp,
					esp32Connected: (message.data.connected as boolean) !== false,
				}));
				break;
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
				console.error("MQTT device error:", message.data);
				break;
		}
	}, []);

	const {
		isConnected,
		isConnecting,
		error,
		connectionAttempts,
		connect: mqttConnect,
		disconnect: mqttDisconnect,
		publish,
		resetConnection,
	} = useMQTT(chipId, { onMessage: handleMessage });

	// Auto-connect based on current mode
	useEffect(() => {
		if (!chipId) return;

		if (connectionMode === "direct-ap") {
			// Skip mDNS — connect directly to ESP32's SoftAP gateway
			mqttConnect("mqtt://192.168.4.1:1883", chipId);
		} else {
			startScan();
		}

		return () => {
			// cleanup handled by hooks
		};
	}, [chipId, connectionMode, startScan]);

	// When feeder is discovered via mDNS (auto mode), connect MQTT
	useEffect(() => {
		if (discoveredFeeder && chipId && connectionMode === "auto") {
			const brokerUrl = `mqtt://${discoveredFeeder.host}:${discoveredFeeder.port}`;
			mqttConnect(brokerUrl, chipId);
		}
	}, [discoveredFeeder, chipId, mqttConnect]);

	const setChipId = useCallback(
		(nextChipId: string | null) => {
			setChipIdState(nextChipId);

			if (nextChipId) {
				AsyncStorage.setItem("floydChipId", nextChipId).catch(console.error);
				return;
			}

			AsyncStorage.removeItem("floydChipId").catch(console.error);
			mqttDisconnect();
		},
		[mqttDisconnect],
	);

	const publishCommand = useCallback(
		(action: string, parameters?: object): boolean => {
			return publish("command", {
				action,
				parameters,
				timestamp: Date.now(),
			});
		},
		[publish],
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

	const connect = useCallback(() => {
		if (!chipId) return;

		if (connectionMode === "direct-ap") {
			mqttConnect("mqtt://192.168.4.1:1883", chipId);
		} else {
			startScan();
		}
	}, [chipId, connectionMode, startScan, mqttConnect]);

	const disconnect = useCallback(() => {
		mqttDisconnect();
	}, [mqttDisconnect]);

	const setFeedLogs = useCallback((logs: FeedLogEntry[]) => {
		setFeedLogsState(logs);
		AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(
			console.error,
		);
	}, []);

	const publishScheduleSync = useCallback(
		(schedules: Schedule[]): boolean => {
			return publish("command", {
				action: "set_schedules",
				parameters: { schedules },
				timestamp: Date.now(),
			});
		},
		[publish],
	);

	const esp32Status: "connected" | "disconnected" | "unknown" =
		deviceData.esp32Connected === true
			? "connected"
			: deviceData.esp32Connected === false
				? "disconnected"
				: "unknown";

	const contextValue: ESP32ContextType = useMemo(
		() => ({
			isConnected,
			isConnecting,
			error,
			connectionAttempts,
			deviceData,
			chipId,
			setChipId,
			connectionMode,
			setConnectionMode,
			connect,
			disconnect,
			resetConnection,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			isAutoRefreshEnabled,
			setAutoRefreshEnabled,
			autoRefreshInterval,
			setAutoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			publishScheduleSync,
		}),
		[
			isConnected,
			isConnecting,
			error,
			connectionAttempts,
			deviceData,
			chipId,
			setChipId,
			connectionMode,
			setConnectionMode,
			connect,
			disconnect,
			resetConnection,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			isAutoRefreshEnabled,
			autoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			publishScheduleSync,
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
