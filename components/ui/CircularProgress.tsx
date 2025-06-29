import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  percentage,
  size = 120,
  strokeWidth = 8,
  color,
}) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background circle */}
      <View
        style={[
          styles.backgroundCircle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
          },
        ]}
      />
      {/* Progress indicator */}
      <View
        style={[
          styles.progressCircle,
          {
            width: size - strokeWidth,
            height: size - strokeWidth,
            borderRadius: (size - strokeWidth) / 2,
            borderWidth: strokeWidth / 2,
            borderTopColor: percentage > 25 ? color : "transparent",
            borderRightColor: percentage > 50 ? color : "transparent",
            borderBottomColor: percentage > 75 ? color : "transparent",
            borderLeftColor: percentage > 0 ? color : "transparent",
          },
        ]}
      />
      {/* Center text */}
      <Text style={[styles.percentageText, { color, fontSize: size * 0.2 }]}>
        {percentage}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundCircle: {
    position: "absolute",
    borderColor: "#E5E7EB",
  },
  progressCircle: {
    position: "absolute",
    borderColor: "transparent",
  },
  percentageText: {
    fontWeight: "bold",
    zIndex: 1,
  },
});
