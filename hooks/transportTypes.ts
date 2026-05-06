/** Message parsed from BLE notify characteristics (replaces MQTT topic routing). */
export interface BLEMessage {
	type:
		| "sensor_data"
		| "control_response"
		| "error"
		| "status"
		| "schedules_list";
	data: Record<string, unknown> | unknown[];
	timestamp: number;
}

/** mDNS replacement — BLE scan results mapped for the connection UI. */
export interface DiscoveredFeederBle {
	deviceId: string;
	deviceName: string;
	rssi: number;
	chipId: string;
	/** Estimated distance in meters from RSSI path-loss model (advisory only). */
	estimatedDistanceM: number;
}

/** Top-level connection state for the BLE-only state machine. */
export type ConnectionState =
	| "idle"
	| "scanning"
	| "connecting"
	| "connected"
	| "error";

/** Structured error kind for the connection error state. */
export type ConnectionErrorKind =
	| "no_devices"
	| "connection_failed"
	| "connection_lost"
	| "permission_denied"
	| "bluetooth_off"
	| "unknown";

export interface ConnectionError {
	kind: ConnectionErrorKind;
	message: string;
}
