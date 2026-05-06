import { useCallback, useRef, useState } from "react";
import mqtt, { MqttClient } from "mqtt";

type GlobalWithProcess = typeof globalThis & {
	process?: {
		nextTick?: (callback: () => void) => void;
	};
};

const globalScope = globalThis as GlobalWithProcess;
globalScope.process = globalScope.process ?? {};
globalScope.process.nextTick =
	globalScope.process.nextTick ?? ((callback) => setTimeout(callback, 0));

export interface MQTTMessage {
	type:
		| "sensor_data"
		| "control_response"
		| "error"
		| "status"
		| "schedules_list";
	/** Responses like schedules_list attach a JSON array here; others use objects. */
	data: Record<string, unknown> | unknown[];
	timestamp: number;
}

interface MQTTState {
	isConnected: boolean;
	isConnecting: boolean;
	error: string | null;
	lastMessage: MQTTMessage | null;
	connectionAttempts: number;
}

interface UseMQTTOptions {
	onMessage?: (message: MQTTMessage) => void;
	onChipIdDiscovered?: (chipId: string) => void;
}

const useMQTT = (deviceChipId: string | null, options: UseMQTTOptions = {}) => {
	const [state, setState] = useState<MQTTState>({
		isConnected: false,
		isConnecting: false,
		error: null,
		lastMessage: null,
		connectionAttempts: 0,
	});

	const clientRef = useRef<MqttClient | null>(null);
	const chipIdRef = useRef(deviceChipId);
	const onMessageRef = useRef(options.onMessage);
	const onChipIdDiscoveredRef = useRef(options.onChipIdDiscovered);
	const lastBrokerUrlRef = useRef<string | null>(null);
	const connectingRef = useRef(false);
	const discoveredChipIdsRef = useRef<Set<string>>(new Set());
	chipIdRef.current = deviceChipId;
	onMessageRef.current = options.onMessage;
	onChipIdDiscoveredRef.current = options.onChipIdDiscovered;

	const disconnect = useCallback(() => {
		if (clientRef.current) {
			clientRef.current.end(true);
			clientRef.current = null;
		}

		setState((prev) => ({
			...prev,
			isConnected: false,
			isConnecting: false,
			error: null,
		}));
	}, []);

	const connect = useCallback((brokerUrl: string, nextChipId?: string) => {
		const chipId = nextChipId ?? chipIdRef.current;

		if (connectingRef.current) {
			// already connecting, skip duplicate call
			return;
		}

		if (!brokerUrl) {
			setState((prev) => ({
				...prev,
				error: "No feeder discovered yet",
				isConnecting: false,
			}));
			return;
		}

		if (clientRef.current) {
			clientRef.current.end(true);
			clientRef.current = null;
		}

		chipIdRef.current = chipId;
		lastBrokerUrlRef.current = brokerUrl;
		connectingRef.current = true;
		setState((prev) => ({ ...prev, isConnecting: true, error: null }));

		const client = mqtt.connect(brokerUrl, {
			clientId: `floyd-app-${Date.now().toString(36)}`,
			clean: true,
			keepalive: 30,
			connectTimeout: 10000,
			reconnectPeriod: 3000,
			timerVariant: "native",
		});

		client.on("connect", () => {
			connectingRef.current = false;
			setState((prev) => ({
				...prev,
				isConnected: true,
				isConnecting: false,
				error: null,
				connectionAttempts: 0,
			}));

			if (chipId) {
				// Normal mode: subscribe to this device's topics
				client.subscribe(`floyd/devices/${chipId}/telemetry`, { qos: 0 });
				client.subscribe(`floyd/devices/${chipId}/status`, { qos: 0 });
				client.subscribe(`floyd/devices/${chipId}/response`, { qos: 0 });
			} else {
				// Discovery mode: subscribe to wildcard to find any feeder
				client.subscribe(`floyd/devices/+/status`, { qos: 0 });
			}
		});

		client.on("reconnect", () => {
			setState((prev) => ({
				...prev,
				isConnected: false,
				isConnecting: true,
				connectionAttempts: prev.connectionAttempts + 1,
			}));
		});

		client.on("message", (topic, payload) => {
			// Wildcard discovery: extract chipId from topic like floyd/devices/abc123/status
			const wildcardMatch = topic.match(/^floyd\/devices\/([^/]+)\/status$/);
			if (wildcardMatch && !chipId) {
				const discoveredId = wildcardMatch[1];
				if (!discoveredChipIdsRef.current.has(discoveredId)) {
					discoveredChipIdsRef.current.add(discoveredId);
					onChipIdDiscoveredRef.current?.(discoveredId);
				}
				return; // discovery message — don't forward as normal message
			}

			try {
				const raw = JSON.parse(payload.toString());
				if (!raw || typeof raw !== "object") return;
				const msg = raw as Record<string, unknown>;
				if (typeof msg.type !== "string") return;

				const rawData = msg.data;
				const data: MQTTMessage["data"] =
					rawData === undefined || rawData === null
						? {}
						: Array.isArray(rawData)
							? rawData
							: typeof rawData === "object"
								? (rawData as Record<string, unknown>)
								: {};

				const parsed: MQTTMessage = {
					type: msg.type as MQTTMessage["type"],
					data,
					timestamp: (msg.timestamp as number) ?? Date.now(),
				};

				setState((prev) => ({ ...prev, lastMessage: parsed, error: null }));
				try {
					onMessageRef.current?.(parsed);
				} catch (callbackError) {
					console.error("MQTT message handler threw:", callbackError);
				}
			} catch (error) {
				console.error("Failed to parse MQTT message:", error);
			}
		});

		client.on("error", (error) => {
			connectingRef.current = false;
			setState((prev) => ({
				...prev,
				error: error.message,
				isConnecting: false,
			}));
		});

		client.on("offline", () => {
			connectingRef.current = false;
			setState((prev) => ({ ...prev, isConnected: false }));
		});

		client.on("close", () => {
			connectingRef.current = false;
			setState((prev) => ({
				...prev,
				isConnected: false,
				isConnecting: false,
			}));
		});

		clientRef.current = client;
	}, []);

	const publish = useCallback(
		(topic: "command" | "config", payload: object): boolean => {
			const chipId = chipIdRef.current;

			if (!clientRef.current?.connected || !chipId) {
				setState((prev) => ({ ...prev, error: "MQTT is not connected" }));
				return false;
			}

			const fullTopic = `floyd/devices/${chipId}/${topic}`;
			clientRef.current.publish(fullTopic, JSON.stringify(payload), { qos: 0 });
			return true;
		},
		[],
	);

	const resetConnection = useCallback(() => {
		const chipId = chipIdRef.current;
		const brokerUrl = lastBrokerUrlRef.current;
		disconnect();
		if (chipId && brokerUrl) {
			setTimeout(() => connect(brokerUrl, chipId), 500);
		}
	}, [connect, disconnect]);

	return {
		...state,
		connect,
		disconnect,
		publish,
		resetConnection,
	};
};

export default useMQTT;
