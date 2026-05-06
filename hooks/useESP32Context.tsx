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
import useMQTT, { type MQTTMessage } from "./useMQTT";
import type { ActiveTransport, DiscoveredFeederBle, FeederLinkPhase } from "./transportTypes";

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

export interface ESP32ContextType {
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;
	connectionAttempts: number;
	deviceData: ESP32Data;
	chipId: string | null;
	setChipId: (chipId: string | null) => void;
	activeTransport: ActiveTransport;
	feederLinkPhase: FeederLinkPhase;
	connect: () => void;
	disconnect: () => void;
	resetConnection: () => void;
	publishCommand: (action: string, parameters?: object) => boolean;
	startFeed: (params: FeedParams) => void;
	stopFeed: () => void;
	clearJam: (speed?: number, duration?: number) => void;
	setSensorReadingInterval: (interval: number) => boolean;
	requestSensorData: () => boolean;
	reloadSchedules: () => Promise<boolean>;
	isAutoRefreshEnabled: boolean;
	setAutoRefreshEnabled: (enabled: boolean) => void;
	autoRefreshInterval: number;
	setAutoRefreshInterval: (interval: number) => void;
	esp32Status: "connected" | "disconnected" | "unknown";
	feedLogs: FeedLogEntry[];
	setFeedLogs: (logs: FeedLogEntry[]) => void;
	publishScheduleSync: (schedules: Schedule[]) => Promise<boolean>;
	bleDevices: DiscoveredFeederBle[];
	isBleScanning: boolean;
	bleDiscoveryError: string | null;
	bleRssi: number | null;
	startBleScan: () => void;
	stopBleScan: () => void;
	clearBleDiscovered: () => void;
	connectBleDevice: (deviceId: string, feederChipId: string) => void;
	beginApWifiFallback: () => Promise<void>;
	connectMqttToSoftAp: () => void;
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
	const [feederLinkPhase, setFeederLinkPhase] =
		useState<FeederLinkPhase>("ble");
	const [deviceData, setDeviceData] = useState<ESP32Data>({});
	const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
	const [autoRefreshInterval, setAutoRefreshInterval] = useState(
		DEFAULT_AUTO_REFRESH_INTERVAL,
	);
	const [feedLogs, setFeedLogsState] = useState<FeedLogEntry[]>([]);
	const feedLogJournalRef = useRef<FeedLogEntry[]>([]);

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

	const bleDiscovery = useBLEDiscovery();
	const {
		devices: bleDevices,
		isScanning: isBleScanning,
		error: bleDiscoveryError,
		startScan: startBleScan,
		stopScan: stopBleScan,
		clearDiscovered: clearBleDiscovered,
	} = bleDiscovery;

	const handleMessage = useCallback((message: MQTTMessage) => {
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
						augerSpeed:
							typeof d.augerSpeed === "number" ? d.augerSpeed : 768,
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
					feederConfig:
						(d.feederConfig as FeederConfig) ?? prev.feederConfig,
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

	const onChipIdDiscovered = useCallback((discoveredId: string) => {
		setChipIdState(discoveredId);
		AsyncStorage.setItem("floydChipId", discoveredId).catch(console.error);
	}, []);

	const ble = useBLETransport({ onMessage: handleMessage });

	const {
		isConnected: mqttConnected,
		isConnecting: mqttConnecting,
		error: mqttError,
		connectionAttempts,
		connect: mqttConnect,
		disconnect: mqttDisconnect,
		publish,
		resetConnection: mqttResetConnection,
	} = useMQTT(chipId, { onMessage: handleMessage, onChipIdDiscovered });

	const activeTransport: ActiveTransport =
		feederLinkPhase === "wifi_mqtt" ||
		(feederLinkPhase === "wifi_instructions" && mqttConnected)
			? "mqtt"
			: "ble";

	const isConnected =
		feederLinkPhase === "wifi_mqtt" || feederLinkPhase === "wifi_instructions"
			? mqttConnected
			: ble.isConnected;

	const isConnecting =
		feederLinkPhase === "wifi_mqtt" || feederLinkPhase === "wifi_instructions"
			? mqttConnecting
			: ble.isConnecting;

	const error =
		feederLinkPhase === "wifi_mqtt" || feederLinkPhase === "wifi_instructions"
			? mqttError ?? ble.error
			: ble.error ?? mqttError;

	useEffect(() => {
		if (feederLinkPhase === "wifi_instructions" && mqttConnected) {
			setFeederLinkPhase("wifi_mqtt");
		}
	}, [feederLinkPhase, mqttConnected]);

	useEffect(() => {
		if (!ble.isConnected || feederLinkPhase !== "ble") return;
		const ts = Math.floor(Date.now() / 1000);
		void ble.syncTime(ts);
	}, [ble.isConnected, feederLinkPhase, ble.syncTime]);

	useEffect(() => {
		const sub = AppState.addEventListener("change", (s) => {
			if (
				s === "active" &&
				feederLinkPhase === "ble" &&
				ble.isConnected
			) {
				void ble.syncTime(Math.floor(Date.now() / 1000));
			}
		});
		return () => sub.remove();
	}, [feederLinkPhase, ble.isConnected, ble.syncTime]);

	useEffect(() => {
		if (feederLinkPhase !== "ble" || !chipId) return;
		if (ble.isConnected || ble.isConnecting) return;
		const match = bleDevices.find(
			(d) => d.chipId.toUpperCase() === chipId.toUpperCase(),
		);
		if (match) {
			void ble.connect(match.deviceId);
			void stopBleScan();
		}
	}, [
		feederLinkPhase,
		chipId,
		bleDevices,
		ble.isConnected,
		ble.isConnecting,
		ble.connect,
		stopBleScan,
	]);

	useEffect(() => {
		if (feederLinkPhase !== "ble") return;
		if (ble.isConnected || ble.isConnecting) return;
		void startBleScan();
		return () => {
			void stopBleScan();
		};
	}, [
		feederLinkPhase,
		ble.isConnected,
		ble.isConnecting,
		startBleScan,
		stopBleScan,
	]);

	const setChipId = useCallback(
		(nextChipId: string | null) => {
			setChipIdState(nextChipId);
			if (nextChipId) {
				AsyncStorage.setItem("floydChipId", nextChipId).catch(console.error);
				return;
			}
			AsyncStorage.removeItem("floydChipId").catch(console.error);
			void ble.disconnect();
			mqttDisconnect();
			setFeederLinkPhase("ble");
			clearBleDiscovered();
		},
		[ble.disconnect, mqttDisconnect, clearBleDiscovered],
	);

	const connectBleDevice = useCallback(
		(deviceId: string, feederChipId: string) => {
			setChipIdState(feederChipId);
			AsyncStorage.setItem("floydChipId", feederChipId).catch(console.error);
			setFeederLinkPhase("ble");
			void stopBleScan();
			void ble.connect(deviceId);
		},
		[ble.connect, stopBleScan],
	);

	const publishCommand = useCallback(
		(action: string, parameters?: object): boolean => {
			const payload = { action, parameters, timestamp: Date.now() };
			if (
				(feederLinkPhase === "wifi_mqtt" ||
					feederLinkPhase === "wifi_instructions") &&
				mqttConnected &&
				chipId
			) {
				return publish("command", payload);
			}
			if (ble.isConnected) {
				void ble.writeCommandPayload(payload);
				return true;
			}
			return false;
		},
		[
			feederLinkPhase,
			mqttConnected,
			chipId,
			publish,
			ble.isConnected,
			ble.writeCommandPayload,
		],
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
		if (feederLinkPhase === "wifi_instructions" || feederLinkPhase === "wifi_mqtt") {
			mqttConnect("mqtt://192.168.4.1:1883", chipId ?? undefined);
			return;
		}
		void startBleScan();
	}, [feederLinkPhase, chipId, mqttConnect, startBleScan]);

	const disconnect = useCallback(() => {
		if (feederLinkPhase === "wifi_mqtt" || feederLinkPhase === "wifi_instructions") {
			if (mqttConnected && chipId) {
				publish("command", {
					action: "switch_mode",
					parameters: { mode: "ble" },
					timestamp: Date.now(),
				});
			}
			mqttDisconnect();
			setFeederLinkPhase("ble");
			return;
		}
		void ble.disconnect();
	}, [
		feederLinkPhase,
		mqttConnected,
		chipId,
		publish,
		mqttDisconnect,
		ble.disconnect,
	]);

	const resetConnection = useCallback(() => {
		if (
			feederLinkPhase === "wifi_mqtt" ||
			feederLinkPhase === "wifi_instructions"
		) {
			mqttResetConnection();
			return;
		}
		mqttDisconnect();
		void ble.disconnect();
		void startBleScan();
	}, [feederLinkPhase, mqttResetConnection, ble.disconnect, startBleScan]);

	const setFeedLogs = useCallback((logs: FeedLogEntry[]) => {
		setFeedLogsState(logs);
		AsyncStorage.setItem("floyd-feedlogs", JSON.stringify(logs)).catch(
			console.error,
		);
	}, []);

	const publishScheduleSync = useCallback(
		async (schedules: Schedule[]): Promise<boolean> => {
			if (
				(feederLinkPhase === "wifi_mqtt" ||
					feederLinkPhase === "wifi_instructions") &&
				mqttConnected &&
				chipId
			) {
				return publish("command", {
					action: "set_schedules",
					parameters: { schedules },
					timestamp: Date.now(),
				});
			}
			if (ble.isConnected) {
				return await ble.writeSchedulesChunked(schedules as unknown[]);
			}
			return false;
		},
		[
			feederLinkPhase,
			mqttConnected,
			chipId,
			publish,
			ble.isConnected,
			ble.writeSchedulesChunked,
		],
	);

	const reloadSchedules = useCallback(async (): Promise<boolean> => {
		if (
			(feederLinkPhase === "wifi_mqtt" ||
				feederLinkPhase === "wifi_instructions") &&
			mqttConnected &&
			chipId
		) {
			return publishCommand("get_schedules");
		}
		if (feederLinkPhase === "ble" && ble.isConnected) {
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
	}, [
		feederLinkPhase,
		mqttConnected,
		chipId,
		publishCommand,
		ble.isConnected,
		ble.readSchedulesFromCharacteristic,
		handleMessage,
	]);

	const beginApWifiFallback = useCallback(async () => {
		if (!ble.isConnected) return;
		await ble.switchToAp();
		setFeederLinkPhase("wifi_instructions");
	}, [ble.isConnected, ble.switchToAp]);

	const connectMqttToSoftAp = useCallback(() => {
		mqttConnect("mqtt://192.168.4.1:1883", chipId ?? undefined);
	}, [mqttConnect, chipId]);

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
			activeTransport,
			feederLinkPhase,
			connect,
			disconnect,
			resetConnection,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			reloadSchedules,
			isAutoRefreshEnabled,
			setAutoRefreshEnabled,
			autoRefreshInterval,
			setAutoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			publishScheduleSync,
			bleDevices,
			isBleScanning,
			bleDiscoveryError,
			bleRssi: ble.bleRssi,
			startBleScan,
			stopBleScan,
			clearBleDiscovered,
			connectBleDevice,
			beginApWifiFallback,
			connectMqttToSoftAp,
		}),
		[
			isConnected,
			isConnecting,
			error,
			connectionAttempts,
			deviceData,
			chipId,
			setChipId,
			activeTransport,
			feederLinkPhase,
			connect,
			disconnect,
			resetConnection,
			publishCommand,
			startFeed,
			stopFeed,
			clearJam,
			setSensorReadingInterval,
			requestSensorData,
			reloadSchedules,
			isAutoRefreshEnabled,
			autoRefreshInterval,
			esp32Status,
			feedLogs,
			setFeedLogs,
			publishScheduleSync,
			bleDevices,
			isBleScanning,
			bleDiscoveryError,
			ble.bleRssi,
			startBleScan,
			stopBleScan,
			clearBleDiscovered,
			connectBleDevice,
			beginApWifiFallback,
			connectMqttToSoftAp,
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
