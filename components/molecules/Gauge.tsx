import { View, AccessibilityInfo } from "react-native";
import { useEffect, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ThemedText } from "../ui/Text";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface GaugeProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export function Gauge({ percentage, size = 160, strokeWidth = 12 }: GaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
      if (enabled) {
        animatedProgress.value = percentage;
      }
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled: boolean) => {
        setReduceMotion(enabled);
        if (enabled) {
          animatedProgress.value = percentage;
        }
      }
    );
    return () => sub.remove();
  }, [percentage, animatedProgress]);

  useEffect(() => {
    if (reduceMotion) {
      animatedProgress.value = percentage;
    } else {
      animatedProgress.value = withTiming(percentage, { duration: 1000 });
    }
  }, [percentage, animatedProgress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value / 100),
  }));

  const center = size / 2;

  const getColor = () => {
    if (percentage < 20) return "#EF4444";
    if (percentage < 40) return "#F59E0B";
    return "#0E7490";
  };

  return (
    <View
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#CBD5E1"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View className="absolute items-center">
        <ThemedText variant="display" className="text-primary">
          {Math.round(percentage)}
        </ThemedText>
        <ThemedText variant="caption">% full</ThemedText>
      </View>
    </View>
  );
}
