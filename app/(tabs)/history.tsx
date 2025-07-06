import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import useAlerts from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface SensorLogEntry {
  id: string;
  timestamp: Date;
  temperature?: number;
  distance?: number;
  foodLevel?: number;
  temperatureSensorConnected: boolean;
  ultrasonicSensorConnected: boolean;
}

export default function LogsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const { deviceData, isConnected } = useESP8266();
  const { alerts } = useAlerts();

  const [sensorLogs, setSensorLogs] = useState<SensorLogEntry[]>([]);
  const [showTemperatureLogs, setShowTemperatureLogs] = useState(true);
  const [showAlertLogs, setShowAlertLogs] = useState(true);

  // Log sensor data when it updates (optimized to prevent excessive re-renders)
  useEffect(() => {
    if (isConnected && deviceData.lastUpdate) {
      setSensorLogs((prev) => {
        // Check if this is actually new data to prevent duplicates
        const lastEntry = prev[0];
        if (lastEntry?.timestamp.getTime() === deviceData.lastUpdate) {
          return prev; // Same timestamp, no change needed
        }

        const newLogEntry: SensorLogEntry = {
          id: Date.now().toString(),
          timestamp: new Date(deviceData.lastUpdate!), // Safe because we check lastUpdate exists above
          temperature: deviceData.temperature,
          distance: deviceData.distance,
          foodLevel: deviceData.foodLevelPercentage,
          temperatureSensorConnected:
            deviceData.temperatureSensorConnected ?? false,
          ultrasonicSensorConnected:
            deviceData.ultrasonicSensorConnected ?? false,
        };

        // Keep only last 50 entries to prevent memory issues
        return [newLogEntry, ...prev].slice(0, 50);
      });
    }
  }, [isConnected, deviceData.lastUpdate]); // Only depend on lastUpdate, not entire deviceData

  const clearLogs = () => {
    setSensorLogs([]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString();
  };

  const renderSensorLogItem = ({ item }: { item: SensorLogEntry }) => (
    <View
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
        {item.temperature !== undefined && (
          <Text style={[styles.logValue, { color: colors.text }]}>
            🌡️ {item.temperature.toFixed(1)}°C
          </Text>
        )}
        {item.distance !== undefined && (
          <Text style={[styles.logValue, { color: colors.text }]}>
            📏 {item.distance.toFixed(1)}cm
          </Text>
        )}
        {item.foodLevel !== undefined && (
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

  const renderAlertItem = ({ item }: { item: any }) => (
    <View
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
        <TouchableOpacity onPress={clearLogs} style={styles.clearButton}>
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
                {
                  color: showAlertLogs ? "white" : colors.text,
                },
              ]}
            >
              Alerts History
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
              <FlatList
                data={sensorLogs}
                renderItem={renderSensorLogItem}
                keyExtractor={(item) => item.id}
                style={styles.logList}
                scrollEnabled={false}
              />
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
              <FlatList
                data={alerts}
                renderItem={renderAlertItem}
                keyExtractor={(item) => item.id}
                style={styles.logList}
                scrollEnabled={false}
              />
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
