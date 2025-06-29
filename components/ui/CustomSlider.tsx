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

interface CustomSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export const CustomSlider: React.FC<CustomSliderProps> = ({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const sliderWidth = 280; // Responsive width
  const translateX = useSharedValue(
    ((value - min) / (max - min)) * sliderWidth
  );

  // Update position when value changes externally
  useEffect(() => {
    translateX.value = withSpring(((value - min) / (max - min)) * sliderWidth);
  }, [value, min, max, sliderWidth, translateX]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      // Context is handled internally by the new API
    })
    .onUpdate((event) => {
      const newX = Math.max(
        0,
        Math.min(
          sliderWidth,
          event.translationX + ((value - min) / (max - min)) * sliderWidth
        )
      );
      translateX.value = newX;

      const newValue = Math.round((newX / sliderWidth) * (max - min) + min);
      runOnJS(onValueChange)(newValue);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - 9 }], // -9 to center the thumb
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.sliderContainer}>
        <View
          style={[
            styles.sliderTrack,
            { backgroundColor: colors.border, width: sliderWidth },
          ]}
        >
          <Animated.View
            style={[
              styles.sliderProgress,
              { backgroundColor: colors.primary },
              progressStyle,
            ]}
          />
          <GestureDetector gesture={gesture}>
            <Animated.View
              style={[
                styles.sliderThumb,
                { backgroundColor: colors.primary },
                animatedStyle,
              ]}
            />
          </GestureDetector>
        </View>
        <View style={[styles.sliderLabels, { width: sliderWidth }]}>
          <Text style={[styles.sliderLabel, { color: colors.muted }]}>
            Small
          </Text>
          <Text style={[styles.sliderLabel, { color: colors.muted }]}>
            Large
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  sliderContainer: {
    marginVertical: 8,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    position: "relative",
  },
  sliderProgress: {
    height: "100%",
    borderRadius: 3,
    position: "absolute",
  },
  sliderThumb: {
    position: "absolute",
    top: -6,
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
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sliderLabel: {
    fontSize: 12,
  },
});
