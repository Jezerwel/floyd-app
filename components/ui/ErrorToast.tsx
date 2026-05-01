import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity } from "react-native";
import { IconSymbol } from "./IconSymbol";
import { Colors } from "@/constants/Colors";

interface ErrorToastProps {
  message: string;
  type?: "error" | "warning";
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export function ErrorToast({
  message,
  type = "error",
  visible,
  onDismiss,
  duration = 5000,
}: ErrorToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      timerRef.current = setTimeout(() => {
        dismiss();
      }, duration);
    } else {
      dismiss();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, message]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const isError = type === "error";
  const color = isError ? Colors.light.error : Colors.light.warning;
  const icon = isError ? "exclamationmark.circle.fill" : "exclamationmark.triangle.fill";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: color + "15",
          borderColor: color,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <IconSymbol name={icon} size={20} color={color} />
      <Text style={[styles.message, { color }]} numberOfLines={2}>
        {message}
      </Text>
      <TouchableOpacity onPress={dismiss} style={styles.dismissButton}>
        <IconSymbol name="xmark" size={16} color={color} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    zIndex: 9999,
    elevation: 5,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  dismissButton: {
    padding: 4,
  },
});
