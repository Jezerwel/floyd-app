import { useCallback, useRef, useState } from "react";
import {
	Linking,
	PermissionsAndroid,
	Platform,
	type Permission,
} from "react-native";
import { State } from "react-native-ble-plx";
import {
	chipIdFromDeviceName,
	FLOYD_BLE_SERVICE,
	rssiToDistanceM,
} from "./bleConstants";
import { getBleManager } from "./bleManager";
import type { DiscoveredFeederBle } from "./transportTypes";
import { useMountEffect } from "./useMountEffect";

export type PermissionStatus = "unknown" | "granted" | "denied";

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
	return Object.values(results).every(
		(v) => v === PermissionsAndroid.RESULTS.GRANTED,
	);
}

export function useBLEDiscovery() {
	const [devices, setDevices] = useState<DiscoveredFeederBle[]>([]);
	const [isScanning, setIsScanning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [permissionStatus, setPermissionStatus] =
		useState<PermissionStatus>("unknown");
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

	/**
	 * Check and request Bluetooth permissions WITHOUT starting a scan.
	 * Call this from onboarding UI before the user taps "Find My Feeder".
	 */
	const requestPermissions =
		useCallback(async (): Promise<PermissionStatus> => {
			const ok = await ensureAndroidBlePermissions();
			const status: PermissionStatus = ok ? "granted" : "denied";
			setPermissionStatus(status);
			return status;
		}, []);

	/**
	 * Open the system Settings app for this application so the user
	 * can manually enable Bluetooth permissions.
	 */
	const openAppSettings = useCallback(() => {
		if (Platform.OS === "ios") {
			void Linking.openURL("app-settings:");
		} else {
			void Linking.openSettings();
		}
	}, []);

	const startScan = useCallback(async () => {
		setError(null);
		const ok = await ensureAndroidBlePermissions();
		setPermissionStatus(ok ? "granted" : "denied");
		if (!ok) {
			setError(
				"Bluetooth permission was denied. Open system settings to grant access.",
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

				const rssi = device.rssi ?? -100;
				const next: DiscoveredFeederBle = {
					deviceId: device.id,
					deviceName: name ?? `FloydFeeder-${chipId}`,
					rssi,
					chipId,
					estimatedDistanceM: rssiToDistanceM(rssi),
				};
				byId.current.set(device.id, next);

				// Sort by estimated distance (closest first)
				const sorted = Array.from(byId.current.values()).sort(
					(a, b) => a.estimatedDistanceM - b.estimatedDistanceM,
				);
				setDevices(sorted);
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
		permissionStatus,
		startScan,
		stopScan,
		clearDiscovered,
		requestPermissions,
		openAppSettings,
	};
}
