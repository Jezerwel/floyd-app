import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "./IconSymbol";

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: "error" | "warning" | "info";
}

export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  onRetry,
  retryLabel = "Retry",
  variant = "error",
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const getVariantColor = () => {
    switch (variant) {
      case "warning":
        return colors.warning;
      case "info":
        return colors.primary;
      default:
        return colors.error;
    }
  };

  const getVariantIcon = () => {
    switch (variant) {
      case "warning":
        return "exclamationmark.triangle.fill";
      case "info":
        return "info.circle.fill";
      default:
        return "xmark.circle.fill";
    }
  };

  const variantColor = getVariantColor();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: variantColor + "15", borderColor: variantColor },
      ]}
    >
      <View style={styles.content}>
        <IconSymbol
          name={getVariantIcon() as "xmark.circle.fill"}
          size={18}
          color={variantColor}
        />
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      </View>
      {onRetry && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: variantColor }]}
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <IconSymbol name="arrow.clockwise" size={14} color="white" />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface ConnectionBadgeProps {
  status: "connected" | "connecting" | "disconnected" | "error";
  label?: string;
  compact?: boolean;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  label,
  compact = false,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          color: colors.success,
          icon: "checkmark.circle.fill" as const,
          text: label || "Connected",
        };
      case "connecting":
        return {
          color: colors.warning,
          icon: "arrow.clockwise" as const,
          text: label || "Connecting...",
        };
      case "error":
        return {
          color: colors.error,
          icon: "exclamationmark.triangle.fill" as const,
          text: label || "Error",
        };
      default:
        return {
          color: colors.muted,
          icon: "xmark.circle.fill" as const,
          text: label || "Disconnected",
        };
    }
  };

  const config = getStatusConfig();

  if (compact) {
    return (
      <View style={[styles.compactBadge, { backgroundColor: config.color }]}>
        <View style={styles.pulseDot} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.color + "20", borderColor: config.color },
      ]}
    >
      <IconSymbol name={config.icon} size={14} color={config.color} />
      <Text style={[styles.badgeText, { color: config.color }]}>
        {config.text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  retryText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  compactBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "white",
  },
});
