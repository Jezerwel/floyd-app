import { useState, useCallback, useEffect } from "react";
import { Surface } from "@/components/ui/Surface";
import { LogTimeline } from "@/components/sections/LogTimeline";
import { useESP8266 } from "@/hooks/useESP8266Context";
import useAlerts from "@/hooks/useAlerts";
import { useFeedHistory } from "@/hooks/useFeedHistory";
import { useFocusEffect } from "expo-router";

interface SensorLog {
  timestamp: string;
  temperature?: number;
  distance?: number;
  foodLevel?: number;
}

export default function HistoryScreen() {
  const [sensorLogs, setSensorLogs] = useState<SensorLog[]>([]);
  const { deviceData, isConnected } = useESP8266();
  const { alerts } = useAlerts();
  const { entries: feedLogs, fetchHistory } = useFeedHistory();

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  useEffect(() => {
    if (isConnected && deviceData.lastUpdate) {
      setSensorLogs((prev) => {
        const lastEntry = prev[0];
        if (lastEntry?.timestamp === String(deviceData.lastUpdate)) {
          return prev;
        }

        const newEntry: SensorLog = {
          timestamp: new Date(deviceData.lastUpdate!).toISOString(),
          temperature: deviceData.temperature,
          distance: deviceData.distance,
          foodLevel: deviceData.foodLevelPercentage,
        };

        return [newEntry, ...prev].slice(0, 50);
      });
    }
  }, [
    isConnected,
    deviceData.lastUpdate,
    deviceData.temperature,
    deviceData.distance,
    deviceData.foodLevelPercentage,
  ]);

  const handleClear = useCallback(() => {
    setSensorLogs([]);
  }, []);

  return (
    <Surface safeTop>
      <LogTimeline
        sensorLogs={sensorLogs}
        alertLogs={alerts}
        feedLogs={feedLogs}
        onClear={handleClear}
      />
    </Surface>
  );
}
