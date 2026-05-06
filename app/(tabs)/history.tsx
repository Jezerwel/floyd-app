import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import { LOG_PREVIEW_LIMIT, LOG_SENSOR_PREVIEW_LIMIT } from "@/constants/logs";
import useAlerts, { type Alert } from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP32, type SensorLogEntry } from "@/hooks/useESP32Context";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function ViewMoreButton({
  section,
  colors,
}: {
  section: "sensor" | "alerts" | "feeds";
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: "/logs-more",
          params: { section },
        })
      }
      style={[styles.viewMoreBtn, { borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel="View full list"
    >
      <Text style={[styles.viewMoreText, { color: colors.primary }]}>
        View more
      </Text>
      <IconSymbol name="chevron.right" size={14} color={colors.primary} />
    </TouchableOpacity>
  );
}

export default function LogsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme as keyof typeof Colors];
  const { isConnected, feedLogs, sensorLogs, clearSensorLogs } = useESP32();
  const { alerts } = useAlerts();

  const [showTemperatureLogs, setShowTemperatureLogs] = useState(true);
  const [showAlertLogs, setShowAlertLogs] = useState(true);
  const [showFeedHistory, setShowFeedHistory] = useState(false);

  const handleFeedHistoryToggle = () => {
    setShowFeedHistory(!showFeedHistory);
  };

  const sensorPreview = sensorLogs.slice(0, LOG_SENSOR_PREVIEW_LIMIT);
  const alertsPreview = alerts.slice(0, LOG_PREVIEW_LIMIT);
  const feedPreview = feedLogs.slice(0, LOG_PREVIEW_LIMIT);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const renderSensorLogItem = ({ item }: { item: SensorLogEntry }) => (
    <View
      key={item.id}
      style={[
        styles.logItem,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.logHeader}>
        <Text style={[styles.logTime, { color: colors.text }]}>
          {formatTime(item.timestamp)}
        </Text>
        <Text style={[styles.logDate, { color: colors.muted }]}>
          {formatDate(item.timestamp)}
        </Text>
      </View>
      <View style={styles.logContent}>
        {item.temperature !== undefined && item.temperature !== null && (
          <Text style={[styles.logValue, { color: colors.text }]}>
            🌡️ {item.temperature.toFixed(1)}°C
          </Text>
        )}
        {item.distance !== undefined && item.distance !== null && (
          <Text style={[styles.logValue, { color: colors.text }]}>
            📏 {item.distance.toFixed(1)}cm
          </Text>
        )}
        {item.foodLevel !== undefined && item.foodLevel !== null && (
          <Text style={[styles.logValue, { color: colors.text }]}>
            🥘 {item.foodLevel.toFixed(1)}%
          </Text>
        )}
      </View>
      <View style={styles.sensorStatus}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: item.temperatureSensorConnected
                ? colors.success
                : colors.error,
            },
          ]}
        />
        <Text style={[styles.statusText, { color: colors.muted }]}>Temp</Text>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: item.ultrasonicSensorConnected
                ? colors.success
                : colors.error,
            },
          ]}
        />
        <Text style={[styles.statusText, { color: colors.muted }]}>
          Distance
        </Text>
      </View>
    </View>
  );

  const renderAlertItem = ({ item }: { item: Alert }) => (
    <View
      key={item.id}
      style={[
        styles.alertLogItem,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor:
            item.severity === "HIGH"
              ? colors.error
              : item.severity === "MEDIUM"
                ? colors.warning
                : colors.success,
          borderLeftWidth: 4,
        },
      ]}
    >
      <View style={styles.alertHeader}>
        <Text style={[styles.alertType, { color: colors.text }]}>
          {item.type}
        </Text>
        <Text style={[styles.alertTime, { color: colors.muted }]}>
          {item.timestamp}
        </Text>
      </View>
      <Text style={[styles.alertMessage, { color: colors.muted }]}>
        {item.message}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <IconSymbol name="house.fill" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Sensor Logs
        </Text>
        <TouchableOpacity onPress={clearSensorLogs} style={styles.clearButton}>
          <IconSymbol name="trash" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Connection Status */}
        <StatCard
          title="Logging Status"
          icon="antenna.radiowaves.left.and.right"
          color={isConnected ? colors.success : colors.error}
        >
          <View style={styles.statusContainer}>
            <Text style={[styles.statusText, { color: colors.text }]}>
              {isConnected
                ? "✅ Actively logging sensor data"
                : "❌ Not connected - logging paused"}
            </Text>
            <Text style={[styles.logCount, { color: colors.muted }]}>
              {sensorLogs.length} sensor readings logged
            </Text>
          </View>
        </StatCard>

        {/* Log Controls */}
        <View style={styles.logControls}>
          <TouchableOpacity
            style={[
              styles.logToggle,
              {
                backgroundColor: showTemperatureLogs
                  ? colors.primary
                  : colors.border,
              },
            ]}
            onPress={() => setShowTemperatureLogs(!showTemperatureLogs)}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color: showTemperatureLogs ? "white" : colors.text,
                },
              ]}
            >
              Sensor Data
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.logToggle,
              {
                backgroundColor: showAlertLogs
                  ? colors.secondary
                  : colors.border,
              },
            ]}
            onPress={() => setShowAlertLogs(!showAlertLogs)}
          >
            <Text
              style={[
                styles.toggleText,
                { color: showAlertLogs ? "white" : colors.text },
              ]}
            >
              Alerts History
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.logToggle,
              {
                backgroundColor: showFeedHistory
                  ? colors.accent
                  : colors.border,
              },
            ]}
            onPress={handleFeedHistoryToggle}
          >
            <Text
              style={[
                styles.toggleText,
                { color: showFeedHistory ? "white" : colors.text },
              ]}
            >
              Feed History
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sensor Data Logs */}
        {showTemperatureLogs && (
          <StatCard
            title={`Sensor Data (${sensorLogs.length})`}
            icon="waveform"
            color={colors.primary}
          >
            {sensorLogs.length > 0 ? (
              <>
                <View style={styles.logList}>
                  {sensorPreview.map((item) => renderSensorLogItem({ item }))}
                </View>
                {sensorLogs.length > LOG_SENSOR_PREVIEW_LIMIT && (
                  <ViewMoreButton section="sensor" colors={colors} />
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <IconSymbol name="circle" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  No sensor data logged yet
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                  Connect to your device to start logging
                </Text>
              </View>
            )}
          </StatCard>
        )}

        {/* Alert History */}
        {showAlertLogs && (
          <StatCard
            title={`Alert History (${alerts.length})`}
            icon="bell.badge"
            color={colors.secondary}
          >
            {alerts.length > 0 ? (
              <>
                <View style={styles.logList}>
                  {alertsPreview.map((item) => renderAlertItem({ item }))}
                </View>
                {alerts.length > LOG_PREVIEW_LIMIT && (
                  <ViewMoreButton section="alerts" colors={colors} />
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={32}
                  color={colors.success}
                />
                <Text style={[styles.emptyText, { color: colors.success }]}>
                  No alerts recorded
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                  All systems operating normally
                </Text>
              </View>
            )}
          </StatCard>
        )}

        {/* Feed History */}
        {showFeedHistory && (
          <StatCard
            title={`Feed History (${feedLogs.length})`}
            icon="clock.fill"
            color={colors.accent}
          >
            {feedLogs.length > 0 ? (
              <>
                {feedPreview.map((log, logIndex) => (
                  <View
                    key={`${log.id}-${logIndex}`}
                    style={[
                      styles.logItem,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.logHeader}>
                      <Text style={[styles.logTime, { color: colors.text }]}>
                        {new Date(log.timestamp).toLocaleString()}
                      </Text>
                      <Text
                        style={[
                          styles.logTime,
                          {
                            color: log.success ? colors.success : colors.error,
                          },
                        ]}
                      >
                        {log.success ? "OK" : "FAIL"}
                      </Text>
                    </View>
                    <View style={styles.logContent}>
                      <Text style={[styles.logValue, { color: colors.text }]}>
                        {Math.round(log.feedMs / 1000)}s
                      </Text>
                      <Text style={[styles.logValue, { color: colors.muted }]}>
                        Auger: {Math.round(log.augerSpeed / 10.23)}%
                      </Text>
                      <Text style={[styles.logValue, { color: colors.muted }]}>
                        Impeller: {Math.round(log.impellerSpeed / 10.23)}%
                      </Text>
                    </View>
                    {log.errorMessage && (
                      <Text style={[styles.logValue, { color: colors.error }]}>
                        {log.errorMessage}
                      </Text>
                    )}
                  </View>
                ))}
                {feedLogs.length > LOG_PREVIEW_LIMIT && (
                  <ViewMoreButton section="feeds" colors={colors} />
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <IconSymbol name="clock.fill" size={32} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.muted }]}>
                  No feed history yet
                </Text>
                <Text style={[styles.emptySubtext, { color: colors.muted }]}>
                  Feed logs will appear here after scheduled or manual feeds
                </Text>
              </View>
            )}
          </StatCard>
        )}

        {/* Bottom spacing for tab bar */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    flex: 1,
    marginLeft: 12,
  },
  clearButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statusContainer: {
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
  },
  logCount: {
    fontSize: 14,
  },
  logControls: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 16,
  },
  logToggle: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  logList: {
    maxHeight: 300,
  },
  viewMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 28,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewMoreText: {
    fontSize: 15,
    fontWeight: "600",
  },
  logItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  logTime: {
    fontSize: 14,
    fontWeight: "600",
  },
  logDate: {
    fontSize: 12,
  },
  logContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  logValue: {
    fontSize: 14,
  },
  sensorStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  alertLogItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  alertType: {
    fontSize: 14,
    fontWeight: "600",
  },
  alertTime: {
    fontSize: 12,
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
  },
  bottomSpacing: {
    height: 20,
  },
});
