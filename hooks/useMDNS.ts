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

  const startScan = useCallback(() => {
    if (zeroconfRef.current) return; // already scanning

    const zeroconf = new Zeroconf();
    zeroconfRef.current = zeroconf;

    setState((prev) => ({ ...prev, isScanning: true, error: null }));

    zeroconf.on(
      "resolved",
      (service: { name: string; host: string; port: number }) => {
        const name = service.name || "";
        if (!name.startsWith(FEEDER_SERVICE_PREFIX)) return;

        const chipId = name
          .replace(FEEDER_SERVICE_PREFIX, "")
          .replace(/\._mqtt\._tcp\.local\.?$/, "");

        // If targeting a specific chipId, only accept that one
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
        zeroconf.stop();
      },
    );

    zeroconf.on("error", (err: Error) => {
      setState((prev) => ({
        ...prev,
        isScanning: false,
        error: err?.message || "mDNS scan failed",
      }));
    });

    zeroconf.scan("mqtt", "tcp", "local.");
  }, [targetChipId]);

  const stopScan = useCallback(() => {
    if (zeroconfRef.current) {
      zeroconfRef.current.stop();
      zeroconfRef.current = null;
    }
    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  // Cleanup on unmount via ref-based stop — no useEffect
  const cleanupRef = useRef(() => {
    if (zeroconfRef.current) {
      zeroconfRef.current.stop();
    }
  });
  // Store cleanup in module-level registry for app-level teardown
  if (typeof globalThis !== "undefined") {
    (globalThis as Record<string, unknown>).__floydMdnsCleanup = cleanupRef.current;
  }

  return { ...state, startScan, stopScan };
}
