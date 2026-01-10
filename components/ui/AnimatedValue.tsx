import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TextStyle } from "react-native";

interface AnimatedValueProps {
  value: number | null | undefined;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  style?: TextStyle;
  suffixStyle?: TextStyle;
  placeholder?: string;
  duration?: number;
}

export const AnimatedValue: React.FC<AnimatedValueProps> = ({
  value,
  suffix = "",
  prefix = "",
  decimals = 1,
  style,
  suffixStyle,
  placeholder = "--",
  duration = 500,
}) => {
  const animatedValue = useRef(new Animated.Value(value ?? 0)).current;
  const displayValue = useRef(value ?? 0);
  const [displayText, setDisplayText] = React.useState(
    value !== null && value !== undefined
      ? `${prefix}${value.toFixed(decimals)}${suffix}`
      : placeholder
  );

  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplayText(placeholder);
      return;
    }

    const listener = animatedValue.addListener(({ value: animValue }) => {
      displayValue.current = animValue;
      setDisplayText(`${prefix}${animValue.toFixed(decimals)}${suffix}`);
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listener);
    };
  }, [value, prefix, suffix, decimals, placeholder, duration, animatedValue]);

  const isPlaceholder = value === null || value === undefined;

  return (
    <Text style={[styles.value, style]}>
      {isPlaceholder ? (
        placeholder
      ) : (
        <>
          {prefix}
          {displayValue.current.toFixed(decimals)}
          {suffix && <Text style={[styles.suffix, suffixStyle]}>{suffix}</Text>}
        </>
      )}
    </Text>
  );
};

interface AnimatedPercentageProps {
  value: number | null | undefined;
  color: string;
  size?: "small" | "medium" | "large";
}

export const AnimatedPercentage: React.FC<AnimatedPercentageProps> = ({
  value,
  color,
  size = "medium",
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleValue, {
        toValue: 1.1,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [value, scaleValue]);

  const fontSize = size === "small" ? 16 : size === "medium" ? 24 : 32;

  return (
    <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
      <AnimatedValue
        value={value}
        suffix="%"
        style={{ fontSize, fontWeight: "bold", color }}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  value: {
    fontSize: 24,
    fontWeight: "bold",
  },
  suffix: {
    fontSize: 16,
    fontWeight: "normal",
  },
});
