import { useCallback, useRef, useState } from "react";
import type { Device, Subscription } from "react-native-ble-plx";
import { fromByteArray, toByteArray } from "react-native-quick-base64";
import {
	FLOYD_BLE_COMMAND,
	FLOYD_BLE_FEEDLOG,
	FLOYD_BLE_RESPONSE,
	FLOYD_BLE_SCHEDULES,
	FLOYD_BLE_SERVICE,
	FLOYD_BLE_STATUS,
	FLOYD_BLE_TELEMETRY,
	FLOYD_BLE_TIME,
} from "./bleConstants";
import { getBleManager } from "./bleManager";
import type { BLEMessage } from "./transportTypes";

const CHUNK_PAYLOAD_MAX = 480;

export interface UseBLETransportOptions {
	onMessage?: (message: BLEMessage) => void;
	/** Called when the BLE peripheral disconnects unexpectedly. */
	onDisconnect?: (reason: string | null) => void;
}

function parseNotifyToMessage(valueBase64: string | null): BLEMessage | null {
	if (!valueBase64) return null;
	try {
		const bytes = toByteArray(valueBase64);
		const text = new TextDecoder().decode(bytes);
		const raw = JSON.parse(text) as Record<string, unknown>;
		if (!raw || typeof raw !== "object" || typeof raw.type !== "string")
			return null;
		return {
			type: raw.type as BLEMessage["type"],
			data: (raw.data as Record<string, unknown> | unknown[]) ?? {},
			timestamp: (raw.timestamp as number) ?? Date.now(),
		};
	} catch {
		return null;
	}
}

export function useBLETransport(options: UseBLETransportOptions) {
	const { onMessage, onDisconnect } = options;
	const onMessageRef = useRef(onMessage);
	onMessageRef.current = onMessage;
	const onDisconnectRef = useRef(onDisconnect);
	onDisconnectRef.current = onDisconnect;

	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [bleRssi, setBleRssi] = useState<number | null>(null);
	const [disconnectReason, setDisconnectReason] = useState<string | null>(null);

	const deviceRef = useRef<Device | null>(null);
	const subsRef = useRef<Subscription[]>([]);
	const disconnectSubRef = useRef<Subscription | null>(null);

	const tearDownMonitors = useCallback(() => {
		for (const s of subsRef.current) {
			try {
				s.remove();
			} catch {
				// ignore
			}
		}
		subsRef.current = [];
		disconnectSubRef.current?.remove();
		disconnectSubRef.current = null;
	}, []);

	const attachMonitors = useCallback(
		(dev: Device) => {
			tearDownMonitors();
			const uuids = [
				FLOYD_BLE_RESPONSE,
				FLOYD_BLE_TELEMETRY,
				FLOYD_BLE_STATUS,
				FLOYD_BLE_FEEDLOG,
			];
			for (const c of uuids) {
				const sub = dev.monitorCharacteristicForService(
					FLOYD_BLE_SERVICE,
					c,
					(mErr, ch) => {
						if (mErr || !ch?.value) return;
						const msg = parseNotifyToMessage(ch.value);
						if (msg) {
							try {
								onMessageRef.current?.(msg);
							} catch (e) {
								console.error("BLE notify handler:", e);
							}
						}
					},
				);
				subsRef.current.push(sub);
			}
		},
		[tearDownMonitors],
	);

	const disconnect = useCallback(async () => {
		tearDownMonitors();
		const d = deviceRef.current;
		deviceRef.current = null;
		setIsConnected(false);
		setIsConnecting(false);
		setBleRssi(null);
		setDisconnectReason(null);
		if (d) {
			try {
				await d.cancelConnection();
			} catch {
				// ignore
			}
		}
	}, [tearDownMonitors]);

	const refreshRssi = useCallback(async (dev: Device) => {
		try {
			const updated = await dev.readRSSI();
			setBleRssi(updated.rssi ?? null);
		} catch {
			// ignore
		}
	}, []);

	const connect = useCallback(
		async (deviceId: string) => {
			setError(null);
			setIsConnecting(true);
			setDisconnectReason(null);

			try {
				const mgr = getBleManager();
				const scanned = await mgr.devices([deviceId]);
				const base = scanned.length ? scanned[0] : null;
				let dev: Device;
				let lastConnErr: unknown = null;
				for (let attempt = 0; attempt < 2; attempt++) {
					try {
						dev = base
							? await base.connect({ timeout: 10000 })
							: await mgr.connectToDevice(deviceId, { timeout: 10000 });
						lastConnErr = null;
						break; // success
					} catch (connErr) {
						lastConnErr = connErr;
						if (attempt === 0) {
							await new Promise((r) => setTimeout(r, 1000));
						}
					}
				}
				if (lastConnErr) throw lastConnErr;
				dev = await dev!.discoverAllServicesAndCharacteristics();
				try {
					dev = await dev.requestMTU(512);
				} catch {
					// iOS / some stacks may ignore
				}
				deviceRef.current = dev;
				attachMonitors(dev);
				disconnectSubRef.current = dev.onDisconnected((err) => {
					const reason = err?.message ?? null;
					setIsConnected(false);
					setBleRssi(null);
					setDisconnectReason(reason);
					deviceRef.current = null;
					tearDownMonitors();
					onDisconnectRef.current?.(reason);
				});
				setIsConnected(true);
				setIsConnecting(false);
				await refreshRssi(dev);
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "Bluetooth connection failed";
				setError(message);
				setIsConnecting(false);
				setIsConnected(false);
				deviceRef.current = null;
				tearDownMonitors();
			}
		},
		[attachMonitors, refreshRssi, tearDownMonitors],
	);

	const writeCommandPayload = useCallback(async (payload: object) => {
		const dev = deviceRef.current;
		if (!dev) return false;
		const json = JSON.stringify(payload);
		const bytes = new TextEncoder().encode(json);
		await dev.writeCharacteristicWithResponseForService(
			FLOYD_BLE_SERVICE,
			FLOYD_BLE_COMMAND,
			fromByteArray(bytes),
		);
		return true;
	}, []);

	const writeCommandJson = useCallback(
		async (action: string, parameters?: object): Promise<boolean> => {
			try {
				return await writeCommandPayload({
					action,
					parameters,
					timestamp: Date.now(),
				});
			} catch {
				setError("Failed to send command over Bluetooth");
				return false;
			}
		},
		[writeCommandPayload],
	);

	const syncTime = useCallback(async (unixSeconds: number) => {
		const dev = deviceRef.current;
		if (!dev) return false;
		const buf = new ArrayBuffer(4);
		new DataView(buf).setUint32(0, unixSeconds >>> 0, true);
		try {
			await dev.writeCharacteristicWithResponseForService(
				FLOYD_BLE_SERVICE,
				FLOYD_BLE_TIME,
				fromByteArray(new Uint8Array(buf)),
			);
			return true;
		} catch {
			return false;
		}
	}, []);

	const readSchedulesFromCharacteristic = useCallback(async (): Promise<
		unknown[] | null
	> => {
		const dev = deviceRef.current;
		if (!dev) return null;
		try {
			const ch = await dev.readCharacteristicForService(
				FLOYD_BLE_SERVICE,
				FLOYD_BLE_SCHEDULES,
			);
			if (!ch?.value) return null;
			const bytes = toByteArray(ch.value);
			const text = new TextDecoder().decode(bytes);
			const parsed = JSON.parse(text) as unknown;
			return Array.isArray(parsed) ? parsed : null;
		} catch {
			setError("Failed to read schedules over Bluetooth");
			return null;
		}
	}, []);

	const writeSchedulesChunked = useCallback(async (schedules: unknown[]) => {
		const dev = deviceRef.current;
		if (!dev) return false;
		const json = JSON.stringify(schedules);
		const enc = new TextEncoder().encode(json);
		const totalChunks = Math.ceil(enc.length / CHUNK_PAYLOAD_MAX) || 1;
		try {
			for (let i = 0; i < totalChunks; i++) {
				const slice = enc.slice(
					i * CHUNK_PAYLOAD_MAX,
					(i + 1) * CHUNK_PAYLOAD_MAX,
				);
				const hdr = new Uint8Array(4);
				new DataView(hdr.buffer).setUint16(0, i, true);
				new DataView(hdr.buffer).setUint16(2, totalChunks, true);
				const merged = new Uint8Array(4 + slice.length);
				merged.set(hdr, 0);
				merged.set(slice, 4);
				await dev.writeCharacteristicWithResponseForService(
					FLOYD_BLE_SERVICE,
					FLOYD_BLE_SCHEDULES,
					fromByteArray(merged),
				);
			}
			return true;
		} catch {
			setError("Failed to sync schedules over Bluetooth");
			return false;
		}
	}, []);

	const refreshRssiCb = useCallback(async () => {
		const d = deviceRef.current;
		if (d) await refreshRssi(d);
	}, [refreshRssi]);

	return {
		isConnected,
		isConnecting,
		error,
		bleRssi,
		disconnectReason,
		connect,
		disconnect,
		writeCommandJson,
		writeCommandPayload,
		syncTime,
		readSchedulesFromCharacteristic,
		writeSchedulesChunked,
		refreshRssi: refreshRssiCb,
		deviceRef,
	};
}
