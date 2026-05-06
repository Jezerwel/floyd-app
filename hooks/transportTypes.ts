export type ActiveTransport = "ble" | "mqtt";

/** mDNS replacement — BLE scan results mapped for the connection UI. */
export interface DiscoveredFeederBle {
	deviceId: string;
	deviceName: string;
	rssi: number;
	chipId: string;
}

export type FeederLinkPhase = "ble" | "wifi_instructions" | "wifi_mqtt";
