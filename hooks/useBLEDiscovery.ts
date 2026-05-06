import { useCallback, useRef, useState } from "react";
import {
	PermissionsAndroid,
	Platform,
	type Permission,
} from "react-native";
import { State } from "react-native-ble-plx";
import { chipIdFromDeviceName, FLOYD_BLE_SERVICE } from "./bleConstants";
import { getBleManager } from "./bleManager";
import type { DiscoveredFeederBle } from "./transportTypes";
import { useMountEffect } from "./useMountEffect";

async function ensureAndroidBlePermissions(): Promise<boolean> {
	if (Platform.OS !== "android") return true;

	const need: Permission[] = [];
	if (Number(Platform.Version) >= 31) {
		need.push(
			PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
			PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
		);
	} else {
		need.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
	}
	const results = await PermissionsAndroid.requestMultiple(need);
	return Object.values(results).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

export function useBLEDiscovery() {
	const [devices, setDevices] = useState<DiscoveredFeederBle[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const byId = useRef<Map<string, DiscoveredFeederBle>>(new Map());

	const stopScan = useCallback(async () => {
		const mgr = getBleManager();
		try {
			await mgr.stopDeviceScan();
		} catch {
			// ignore
		}
		setIsScanning(false);
	}, []);

	const startScan = useCallback(async () => {
		setError(null);
		const ok = await ensureAndroidBlePermissions();
		if (!ok) {
			setError(
				"Bluetooth or location permission was denied. Enable permissions in system settings to scan for feeders.",
			);
			return;
		}

		const mgr = getBleManager();
		const st = await mgr.state();
		if (st !== State.PoweredOn) {
			setError(
				st === State.Unauthorized
					? "Bluetooth is not allowed for this app. Enable it in Settings."
					: "Turn on Bluetooth to find your feeder.",
			);
			return;
		}

		byId.current.clear();
		setDevices([]);

		try {
			await mgr.stopDeviceScan();
		} catch {
			// ignore
		}

		setIsScanning(true);

		mgr.startDeviceScan(
			[FLOYD_BLE_SERVICE],
			{ allowDuplicates: true },
			(_scanError, device) => {
				if (_scanError) {
					setError(_scanError.message);
					return;
				}
				if (!device) return;
				const name = device.name ?? device.localName;
				const chipId = chipIdFromDeviceName(name ?? null);
				if (!chipId) return;

				const next: DiscoveredFeederBle = {
					deviceId: device.id,
					deviceName: name ?? `FloydFeeder-${chipId}`,
					rssi: device.rssi ?? -100,
					chipId,
				};
				byId.current.set(device.id, next);
				setDevices(Array.from(byId.current.values()));
			},
		);
	}, []);

	useMountEffect(() => {
		return () => {
			const mgr = getBleManager();
			void mgr.stopDeviceScan();
		};
	});

	const clearDiscovered = useCallback(() => {
		byId.current.clear();
		setDevices([]);
	}, []);

	return {
		devices,
		isScanning,
		error,
		startScan,
		stopScan,
		clearDiscovered,
	};
}
