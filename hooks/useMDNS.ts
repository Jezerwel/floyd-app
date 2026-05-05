import { useCallback, useRef, useState } from "react";
import Zeroconf from "react-native-zeroconf";

interface DiscoveredFeeder {
	chipId: string;
	host: string;
	port: number;
}

interface MDNSState {
	discoveredFeeder: DiscoveredFeeder | null;
	isScanning: boolean;
	error: string | null;
}

const FEEDER_SERVICE_PREFIX = "floyd-feeder-";

export function useMDNS(targetChipId?: string | null) {
	const [state, setState] = useState<MDNSState>({
		discoveredFeeder: null,
		isScanning: false,
		error: null,
	});
	const zeroconfRef = useRef<Zeroconf | null>(null);

	const stopScan = useCallback(() => {
		if (zeroconfRef.current) {
			try {
				zeroconfRef.current.stop();
			} catch {}
			zeroconfRef.current = null;
		}
		setState((prev) => ({ ...prev, isScanning: false }));
	}, []);

	const startScan = useCallback(() => {
		if (zeroconfRef.current) return; // already scanning

		let zeroconf: Zeroconf | null = null;
		try {
			zeroconf = new Zeroconf();
		} catch {
			setState((prev) => ({
				...prev,
				isScanning: false,
				error: "mDNS is not available on this device (native module missing)",
			}));
			return;
		}

		if (!zeroconf) {
			setState((prev) => ({
				...prev,
				isScanning: false,
				error:
					"mDNS is not available on this device (native module returned null)",
			}));
			return;
		}

		zeroconfRef.current = zeroconf;

		setState((prev) => ({ ...prev, isScanning: true, error: null }));

		const handleResolved = (service: {
			name: string;
			host: string;
			port: number;
		}) => {
			const name = service.name || "";
			if (!name.startsWith(FEEDER_SERVICE_PREFIX)) return;

			const chipId = name
				.replace(FEEDER_SERVICE_PREFIX, "")
				.replace(/\._mqtt\._tcp\.local\.?$/, "");

			if (targetChipId && chipId !== targetChipId) return;

			setState({
				discoveredFeeder: {
					chipId,
					host: service.host,
					port: service.port || 1883,
				},
				isScanning: false,
				error: null,
			});
			try {
				zeroconf.stop();
			} catch {}
		};

		const handleError = (err: Error) => {
			setState((prev) => ({
				...prev,
				isScanning: false,
				error: err?.message || "mDNS scan failed",
			}));
		};

		zeroconf.on("resolved", handleResolved);
		zeroconf.on("error", handleError);

		try {
			zeroconf.scan("mqtt", "tcp", "local.");
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "mDNS scan threw an error";
			setState((prev) => ({
				...prev,
				isScanning: false,
				error: message,
			}));
			zeroconfRef.current = null;
		}
	}, [targetChipId]);

	return { ...state, startScan, stopScan };
}
