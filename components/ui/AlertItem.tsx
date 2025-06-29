import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { IconSymbol } from "./IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AlertItemProps {
  type: string;
  message: string;
  timestamp: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  isResolved: boolean;
}

export const AlertItem: React.FC<AlertItemProps> = ({
  type,
  message,
  timestamp,
  severity,
  isResolved,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const getSeverityColor = () => {
    switch (severity) {
      case "HIGH":
        return colors.error;
      case "MEDIUM":
        return colors.warning;
      case "LOW":
        return colors.primary;
      default:
        return colors.muted;
    }
  };

  const getSeverityIcon = () => {
    switch (severity) {
      case "HIGH":
        return "exclamationmark.triangle.fill";
      case "MEDIUM":
        return "exclamationmark.circle.fill";
      case "LOW":
        return "info.circle.fill";
      default:
        return "info.circle";
    }
  };

  return (
    <View
      style={[
        styles.alertItem,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor: getSeverityColor(),
        },
      ]}
    >
      <View style={styles.alertHeader}>
        <View style={styles.alertTitleRow}>
          <IconSymbol
            name={getSeverityIcon()}
            size={16}
            color={getSeverityColor()}
          />
          <Text style={[styles.alertType, { color: getSeverityColor() }]}>
            {type}
          </Text>
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: getSeverityColor() },
            ]}
          >
            <Text style={styles.severityText}>{severity}</Text>
          </View>
        </View>
        <View
          style={[
            styles.statusIndicator,
            {
              backgroundColor: isResolved ? colors.success : getSeverityColor(),
            },
          ]}
        >
          <IconSymbol
            name={isResolved ? "checkmark" : "exclamationmark"}
            size={12}
            color="white"
          />
        </View>
      </View>
      <Text style={[styles.alertMessage, { color: colors.text }]}>
        {message}
      </Text>
      <Text style={[styles.alertTimestamp, { color: colors.muted }]}>
        {timestamp}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  alertItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  alertTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  alertType: {
    fontSize: 14,
    fontWeight: "600",
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  statusIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  alertTimestamp: {
    fontSize: 12,
  },
});
