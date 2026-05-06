/** Must match `ESP32_MQTT_Server.ino` Floyd BLE service (128-bit UUIDs; last segment 12 hex digits). */
export const FLOYD_BLE_SERVICE = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const FLOYD_BLE_COMMAND = "4fafc201-1fb5-459e-8fcc-c5c9c3319141";
export const FLOYD_BLE_RESPONSE = "4fafc201-1fb5-459e-8fcc-c5c9c3319142";
export const FLOYD_BLE_TELEMETRY = "4fafc201-1fb5-459e-8fcc-c5c9c3319143";
export const FLOYD_BLE_STATUS = "4fafc201-1fb5-459e-8fcc-c5c9c3319144";
export const FLOYD_BLE_SCHEDULES = "4fafc201-1fb5-459e-8fcc-c5c9c3319145";
export const FLOYD_BLE_CONFIG = "4fafc201-1fb5-459e-8fcc-c5c9c3319146";
export const FLOYD_BLE_TIME = "4fafc201-1fb5-459e-8fcc-c5c9c3319147";
export const FLOYD_BLE_FEEDLOG = "4fafc201-1fb5-459e-8fcc-c5c9c3319148";

export const FLOYD_DEVICE_NAME_PREFIX = "FloydFeeder-";

export function chipIdFromDeviceName(
	name: string | null | undefined,
): string | null {
	if (!name || !name.startsWith(FLOYD_DEVICE_NAME_PREFIX)) return null;
	const id = name.slice(FLOYD_DEVICE_NAME_PREFIX.length).trim();
	return id.length ? id : null;
}

// --- RSSI path-loss model helpers (advisory only) ---

const PATH_LOSS_EXPONENT = 2.5;
const TX_POWER_1M = -40; // dBm at 1m for ESP32 BLE (typical)

/**
 * Estimate distance from RSSI using a simplified log-distance path-loss model.
 * Clamped to [0.3m, 30m] — RSSI fluctuates too much for precise values.
 */
export function rssiToDistanceM(
	rssi: number,
	txPower: number = TX_POWER_1M,
): number {
	const raw = Math.pow(10, (txPower - rssi) / (10 * PATH_LOSS_EXPONENT));
	return Math.max(0.3, Math.min(30, Math.round(raw * 10) / 10));
}

/**
 * Convert RSSI to a 0–4 signal bar representation.
 *
 * Mapping (empirical, tuned for ESP32):
 *   > -55 dBm  → 4 bars (excellent)
 *   > -65 dBm  → 3 bars (good)
 *   > -75 dBm  → 2 bars (fair)
 *   > -85 dBm  → 1 bar  (weak)
 *   ≤ -85 dBm  → 0 bars (none)
 */
export function rssiToBars(rssi: number): 0 | 1 | 2 | 3 | 4 {
	if (rssi > -55) return 4;
	if (rssi > -65) return 3;
	if (rssi > -75) return 2;
	if (rssi > -85) return 1;
	return 0;
}
