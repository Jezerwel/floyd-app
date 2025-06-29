import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withSpring,
} from "react-native-reanimated";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface VerticalSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  height?: number;
  title: string;
  icon?: React.ReactNode;
}

export const VerticalSlider: React.FC<VerticalSliderProps> = ({
  value,
  onValueChange,
  min = 1,
  max = 100,
  height = 150,
  title,
  icon,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const translateY = useSharedValue(
    height - ((value - min) / (max - min)) * height
  );

  // Update position when value changes externally
  useEffect(() => {
    translateY.value = withSpring(
      height - ((value - min) / (max - min)) * height
    );
  }, [value, min, max, height, translateY]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      // Context is handled internally by the new API
    })
    .onUpdate((event) => {
      const startY = height - ((value - min) / (max - min)) * height;
      const newY = Math.max(0, Math.min(height, startY + event.translationY));
      translateY.value = newY;

      // Convert Y position to value (inverted because Y=0 is top)
      const newValue = Math.round(
        ((height - newY) / height) * (max - min) + min
      );
      runOnJS(onValueChange)(newValue);
    });

  const animatedThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - 9 }], // -9 to center the thumb
  }));

  const animatedProgressStyle = useAnimatedStyle(() => ({
    height: height - translateY.value,
    marginTop: translateY.value,
  }));

  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

      <View style={styles.sliderWrapper}>
        <View
          style={[
            styles.sliderTrack,
            { height, backgroundColor: colors.border },
          ]}
        >
          <Animated.View
            style={[
              styles.sliderProgress,
              { backgroundColor: colors.primary },
              animatedProgressStyle,
            ]}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                styles.sliderThumb,
                { backgroundColor: colors.primary },
                animatedThumbStyle,
              ]}
            />
          </GestureDetector>
        </View>

        {/* Speed value display */}
        <Text style={[styles.valueText, { color: colors.primary }]}>
          {value}%
        </Text>

        {/* Speed labels */}
        <View style={styles.labelsContainer}>
          <Text style={[styles.label, { color: colors.muted }]}>Max</Text>
          <Text style={[styles.label, { color: colors.muted }]}>Min</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    padding: 16,
  },
  iconContainer: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  sliderWrapper: {
    alignItems: "center",
    flex: 1,
  },
  sliderTrack: {
    width: 6,
    borderRadius: 3,
    position: "relative",
    marginHorizontal: 20,
  },
  sliderProgress: {
    width: "100%",
    borderRadius: 3,
    position: "absolute",
    bottom: 0,
  },
  sliderThumb: {
    position: "absolute",
    left: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  valueText: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 12,
    minHeight: 20,
  },
  labelsContainer: {
    position: "absolute",
    right: -35,
    top: 0,
    bottom: 0,
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  label: {
    fontSize: 10,
    textAlign: "center",
  },
});
