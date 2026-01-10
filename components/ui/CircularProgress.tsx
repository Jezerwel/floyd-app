import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = React.memo(({
  percentage,
  size = 120,
  strokeWidth = 8,
  color,
}) => {
  const animatedPercentage = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(new Animated.Value(1)).current;
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    const listener = animatedPercentage.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });

    Animated.parallel([
      Animated.spring(animatedPercentage, {
        toValue: percentage,
        friction: 8,
        tension: 40,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(scaleValue, {
          toValue: 1.05,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleValue, {
          toValue: 1,
          friction: 3,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    return () => {
      animatedPercentage.removeListener(listener);
    };
  }, [percentage, animatedPercentage, scaleValue]);

  const getColorForLevel = (level: number): string => {
    if (level <= 20) return "#ef4444";
    if (level <= 40) return "#f59e0b";
    return color;
  };

  const displayColor = getColorForLevel(displayValue);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, transform: [{ scale: scaleValue }] },
      ]}
    >
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
      <View
        style={[
          styles.progressCircle,
          {
            width: size - strokeWidth,
            height: size - strokeWidth,
            borderRadius: (size - strokeWidth) / 2,
            borderWidth: strokeWidth / 2,
            borderTopColor: displayValue > 25 ? displayColor : "transparent",
            borderRightColor: displayValue > 50 ? displayColor : "transparent",
            borderBottomColor: displayValue > 75 ? displayColor : "transparent",
            borderLeftColor: displayValue > 0 ? displayColor : "transparent",
          },
        ]}
      />
      <Text
        style={[styles.percentageText, { color: displayColor, fontSize: size * 0.2 }]}
      >
        {displayValue}%
      </Text>
    </Animated.View>
  );
});

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
