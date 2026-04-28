import { View } from "react-native";
import { useMemo } from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ThemedText } from "../ui/Text";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { Gauge } from "../molecules/Gauge";
import { SkeletonCard, Skeleton } from "../molecules/Skeleton";

interface DashboardHeroProps {
  connectionStatus: "connected" | "disconnected" | "unknown";
  isConnecting: boolean;
  foodLevel: number | undefined;
  distance: number | undefined;
  isDistanceConnected: boolean;
  onRefresh: () => void;
}

export function DashboardHero({
  connectionStatus,
  isConnecting,
  foodLevel,
  distance,
  isDistanceConnected,
  onRefresh,
}: DashboardHeroProps) {
  const statusVariant = useMemo(() => {
    switch (connectionStatus) {
      case "connected":
        return "success" as const;
      default:
        return "error" as const;
    }
  }, [connectionStatus]);

  const isLoading = foodLevel === undefined && isConnecting;

  if (isLoading) {
    return (
      <View className="px-4 pt-4">
        <SkeletonCard />
        <Skeleton
          width={160}
          height={160}
          className="self-center mt-6"
          borderRadius={80}
        />
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View className="flex-row items-center justify-between px-4 pt-4">
        <View className="flex-row items-center gap-2">
          <ThemedText variant="h1">Floyd</ThemedText>
          <Badge
            label={
              connectionStatus === "connected" ? "Connected" : "Disconnected"
            }
            variant={statusVariant}
          />
        </View>
        <IconButton
          name="arrow.clockwise"
          onPress={onRefresh}
          accessibilityLabel="Refresh sensor data"
        />
      </View>

      <View className="items-center mt-4 mb-2">
        <Gauge
          percentage={foodLevel ?? 0}
          size={180}
          strokeWidth={14}
        />
        <ThemedText variant="caption" className="mt-2">
          {(distance ?? 0).toFixed(1)} cm
          {!isDistanceConnected && " (sensor offline)"}
        </ThemedText>
      </View>
    </Animated.View>
  );
}
