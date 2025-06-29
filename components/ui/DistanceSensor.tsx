import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "./IconSymbol";

interface DistanceSensorProps {
  distance: number;
  foodLevelPercentage: number;
  isConnected: boolean;
  maxDistance?: number;
  minDistance?: number;
}

export const DistanceSensor: React.FC<DistanceSensorProps> = ({
  distance,
  foodLevelPercentage,
  isConnected,
  maxDistance = 20,
  minDistance = 3,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme as keyof typeof Colors];

  const getStatusColor = () => {
    if (!isConnected) return colors.error;
    if (foodLevelPercentage > 50) return colors.success;
    if (foodLevelPercentage > 20) return colors.warning;
    return colors.error;
  };

  const getStatusIcon = () => {
    if (!isConnected) return "xmark.circle.fill";
    if (foodLevelPercentage > 50) return "checkmark.circle.fill";
    if (foodLevelPercentage > 20) return "exclamationmark.triangle.fill";
    return "xmark.circle.fill";
  };

  const getStatusText = () => {
    if (!isConnected) return "Sensor Offline";
    if (foodLevelPercentage > 50) return "Good Level";
    if (foodLevelPercentage > 20) return "Low Level";
    return "Critical Level";
  };

  // Calculate position for visual indicator (0-100%)
  const indicatorPosition = isConnected
    ? Math.max(
        0,
        Math.min(
          100,
          ((distance - minDistance) / (maxDistance - minDistance)) * 100
        )
      )
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconSymbol name={getStatusIcon()} size={16} color={getStatusColor()} />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
      </View>

      <View style={styles.visualContainer}>
        <View style={[styles.distanceBar, { borderColor: colors.border }]}>
          <View
            style={[
              styles.distanceIndicator,
              {
                backgroundColor: getStatusColor(),
                top: `${100 - indicatorPosition}%`,
              },
            ]}
          />
          <View style={[styles.minLine, { backgroundColor: colors.success }]} />
          <View style={[styles.maxLine, { backgroundColor: colors.error }]} />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.dataRow}>
            <Text style={[styles.label, { color: colors.muted }]}>
              Distance
            </Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {isConnected ? `${distance.toFixed(1)} cm` : "N/A"}
            </Text>
          </View>

          <View style={styles.dataRow}>
            <Text style={[styles.label, { color: colors.muted }]}>
              Food Level
            </Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {isConnected ? `${foodLevelPercentage.toFixed(1)}%` : "N/A"}
            </Text>
          </View>

          <View style={styles.rangeInfo}>
            <Text style={[styles.rangeText, { color: colors.muted }]}>
              Range: {minDistance}cm - {maxDistance}cm
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  visualContainer: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  distanceBar: {
    width: 20,
    height: 80,
    borderWidth: 2,
    borderRadius: 10,
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  distanceIndicator: {
    position: "absolute",
    left: 2,
    right: 2,
    height: 4,
    borderRadius: 2,
  },
  minLine: {
    position: "absolute",
    left: -2,
    right: -2,
    height: 2,
    top: "85%",
    borderRadius: 1,
  },
  maxLine: {
    position: "absolute",
    left: -2,
    right: -2,
    height: 2,
    top: "10%",
    borderRadius: 1,
  },
  infoContainer: {
    flex: 1,
    gap: 8,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
  },
  rangeInfo: {
    marginTop: 4,
  },
  rangeText: {
    fontSize: 12,
    fontStyle: "italic",
  },
});
