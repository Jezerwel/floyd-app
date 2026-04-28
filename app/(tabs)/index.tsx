import { ScrollView, RefreshControl } from "react-native";
import { useCallback, useMemo, useState } from "react";
import { Surface } from "@/components/ui/Surface";
import { DashboardHero } from "@/components/sections/DashboardHero";
import { StatusStrip } from "@/components/sections/StatusStrip";
import { AlertPanel } from "@/components/sections/AlertPanel";
import { useESP8266 } from "@/hooks/useESP8266Context";
import useAlerts from "@/hooks/useAlerts";

function rssiToStrength(rssi: number): number {
  if (rssi > -50) return 100;
  if (rssi < -90) return 0;
  return Math.round(((rssi + 90) / 40) * 100);
}

export default function DashboardScreen() {
  const {
    deviceData,
    isConnected,
    isConnecting,
    esp8266Status,
    requestSensorData,
  } = useESP8266();

  const { alerts, alertCount } = useAlerts();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isConnected) return;
    setIsRefreshing(true);
    const success = requestSensorData();
    const minRefreshTime = success ? 800 : 1500;
    setTimeout(() => {
      setIsRefreshing(false);
    }, minRefreshTime);
  }, [isRefreshing, isConnected, requestSensorData]);

  const foodLevel = useMemo(() => {
    const fl = deviceData.foodLevelPercentage;
    if (typeof fl === "number" && fl >= 0 && fl <= 100) return fl;
    return undefined;
  }, [deviceData.foodLevelPercentage]);

  const motorState = useMemo(
    () => deviceData.motorState ?? "idle",
    [deviceData.motorState]
  );

  const wifiStrength = useMemo(() => {
    const rssi = deviceData.wifiRssi;
    if (typeof rssi === "number") return rssiToStrength(rssi);
    return 0;
  }, [deviceData.wifiRssi]);

  return (
    <Surface safeTop>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <DashboardHero
          connectionStatus={esp8266Status}
          isConnecting={isConnecting}
          foodLevel={foodLevel}
          distance={deviceData.distance}
          isDistanceConnected={deviceData.ultrasonicSensorConnected ?? false}
          onRefresh={handleRefresh}
        />

        <StatusStrip
          temperature={deviceData.temperature}
          motorState={motorState as "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear"}
          wifiStrength={wifiStrength}
        />

        <AlertPanel alerts={alerts} alertCount={alertCount} />
      </ScrollView>
    </Surface>
  );
}
