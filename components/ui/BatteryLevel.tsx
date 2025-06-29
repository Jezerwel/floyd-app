import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface BatteryLevelProps {
  percentage: number;
}

export const BatteryLevel: React.FC<BatteryLevelProps> = ({ percentage }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const getBatteryColor = () => {
    if (percentage > 50) return colors.success;
    if (percentage > 20) return colors.warning;
    return colors.error;
  };

  return (
    <View style={styles.batteryContainer}>
      <View style={[styles.batteryBar, { borderColor: colors.border }]}>
        <View
          style={[
            styles.batteryFill,
            {
              width: `${percentage}%`,
              backgroundColor: getBatteryColor(),
            },
          ]}
        />
      </View>
      <View style={styles.batteryTip} />
      <Text style={[styles.batteryText, { color: colors.text }]}>
        {percentage}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  batteryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  batteryBar: {
    flex: 1,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    padding: 2,
    position: "relative",
  },
  batteryFill: {
    height: "100%",
    borderRadius: 2,
  },
  batteryTip: {
    width: 4,
    height: 12,
    backgroundColor: "#9CA3AF",
    borderRadius: 2,
    marginLeft: -8,
  },
  batteryText: {
    fontSize: 18,
    fontWeight: "bold",
    minWidth: 40,
  },
});
