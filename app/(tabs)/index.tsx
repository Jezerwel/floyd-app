import ESP8266Connection from "@/components/ESP8266Connection";
import { AlertItem } from "@/components/ui/AlertItem";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import useAlerts from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme as keyof typeof Colors];

  // ESP8266 context for real sensor data
  const {
    deviceData,
    isConnected,
    requestSensorData,
    isProxyConnection,
    esp8266Status,
  } = useESP8266();

  // Dynamic alerts system
  const { alerts, alertCount, hasHighSeverityAlerts, hasMediumSeverityAlerts } =
    useAlerts();

  // Local state for UI controls
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing || !isConnected) return;

    setIsRefreshing(true);
    const success = requestSensorData();

    // Wait for a minimum time to show the refresh animation
    // and a bit longer if the request failed to show the state
    const minRefreshTime = success ? 800 : 1500;

    setTimeout(() => {
      setIsRefreshing(false);
    }, minRefreshTime);
  };

  // Sensor validation functions
  const isValidTemperature = (temp?: number): boolean => {
    return temp !== undefined && temp >= -40 && temp <= 85;
  };

  const isValidDistance = (distance?: number): boolean => {
    return distance !== undefined && distance >= 0 && distance <= 400;
  };

  const isValidFoodLevel = (level?: number): boolean => {
    return level !== undefined && level >= 0 && level <= 100;
  };

  // Get real sensor values with validation
  const temperature =
    isConnected && isValidTemperature(deviceData.temperature)
      ? deviceData.temperature
      : null;
  const foodLevel =
    isConnected && isValidFoodLevel(deviceData.foodLevelPercentage)
      ? deviceData.foodLevelPercentage
      : null;
  const distance =
    isConnected && isValidDistance(deviceData.distance)
      ? deviceData.distance
      : null;
  const isTemperatureSensorConnected =
    isConnected && (deviceData.temperatureSensorConnected ?? false);
  const isUltrasonicSensorConnected =
    isConnected && (deviceData.ultrasonicSensorConnected ?? false);

  // Determine alert section color based on severity
  const getAlertSectionColor = () => {
    if (hasHighSeverityAlerts) return colors.error;
    if (hasMediumSeverityAlerts) return colors.warning;
    return colors.success;
  };

  // Determine overall connection status for display
  const getConnectionStatus = () => {
    if (!isConnected) {
      return {
        status: "Disconnected",
        color: colors.error,
        icon: "xmark.circle.fill",
      };
    }

    if (isProxyConnection) {
      // For proxy connections, show ESP8266 status
      if (esp8266Status === "connected") {
        return {
          status: "Connected via Proxy",
          color: colors.success,
          icon: "checkmark.circle.fill",
        };
      } else if (esp8266Status === "disconnected") {
        return {
          status: "Proxy OK, ESP8266 Offline",
          color: colors.warning,
          icon: "exclamationmark.triangle.fill",
        };
      } else {
        return {
          status: "Proxy Connected",
          color: colors.warning,
          icon: "questionmark.circle.fill",
        };
      }
    } else {
      return {
        status: "Connected Direct",
        color: colors.success,
        icon: "checkmark.circle.fill",
      };
    }
  };

  const connectionStatus = getConnectionStatus();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style="dark" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerContent}>
          <View style={styles.deviceInfo}>
            <View>
              <Image
                source={require("../../assets/images/floyd.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <View style={styles.statusRow}>
                <IconSymbol
                  name={connectionStatus.icon as any}
                  size={16}
                  color={connectionStatus.color}
                />
                <View style={styles.statusTextContainer}>
                  <Text
                    style={[
                      styles.statusText,
                      { color: connectionStatus.color },
                    ]}
                  >
                    {connectionStatus.status}
                  </Text>
                  {isProxyConnection && esp8266Status === "disconnected" && (
                    <Text
                      style={[styles.statusSubText, { color: colors.muted }]}
                    >
                      Hardware not responding
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.primary }]}
            onPress={handleRefresh}
            disabled={!isConnected}
          >
            <IconSymbol name="arrow.clockwise" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ESP8266 Connection Management */}
        <ESP8266Connection />

        {/* Proxy Server Status (if using proxy) */}
        {isProxyConnection && (
          <StatCard
            title="Proxy Server Status"
            icon="server.rack"
            color={colors.secondary}
          >
            <View style={styles.proxyStatusContainer}>
              <View style={styles.statusRow}>
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={16}
                  color={colors.success}
                />
                <Text style={[styles.statusText, { color: colors.text }]}>
                  Express Proxy: Connected
                </Text>
              </View>
              <View style={styles.statusRow}>
                <IconSymbol
                  name={
                    esp8266Status === "connected"
                      ? "checkmark.circle.fill"
                      : "xmark.circle.fill"
                  }
                  size={16}
                  color={
                    esp8266Status === "connected"
                      ? colors.success
                      : colors.error
                  }
                />
                <Text style={[styles.statusText, { color: colors.text }]}>
                  ESP8266 Hardware:{" "}
                  {esp8266Status === "connected"
                    ? "Connected"
                    : esp8266Status === "disconnected"
                    ? "Disconnected"
                    : "Unknown"}
                </Text>
              </View>
              {esp8266Status === "disconnected" && (
                <View
                  style={[
                    styles.helpBox,
                    { backgroundColor: colors.warning + "20" },
                  ]}
                >
                  <Text style={[styles.helpText, { color: colors.text }]}>
                    💡 The proxy server is working, but the ESP8266 hardware is
                    not responding. Check device power and WiFi connection.
                  </Text>
                </View>
              )}
            </View>
          </StatCard>
        )}

        {/* Feeder Capacity - Now using real ultrasonic sensor data */}
        <StatCard
          title="Feeder Capacity"
          icon="archivebox.fill"
          color={colors.primary}
        >
          <View style={styles.capacityContainer}>
            <CircularProgress
              percentage={foodLevel ?? 0}
              color={colors.primary}
            />
            <View style={styles.capacityInfo}>
              <Text style={[styles.capacityLabel, { color: colors.muted }]}>
                Food Remaining
              </Text>
              <Text style={[styles.capacityValue, { color: colors.text }]}>
                {foodLevel !== null && foodLevel !== undefined
                  ? `${foodLevel.toFixed(1)}%`
                  : "--"}
              </Text>
              <View style={styles.sensorInfo}>
                <View style={styles.alertRow}>
                  <IconSymbol
                    name={isUltrasonicSensorConnected ? "checkmark" : "xmark"}
                    size={14}
                    color={
                      isUltrasonicSensorConnected
                        ? colors.success
                        : colors.error
                    }
                  />
                  <Text
                    style={[
                      styles.sensorText,
                      {
                        color: isUltrasonicSensorConnected
                          ? colors.success
                          : colors.error,
                      },
                    ]}
                  >
                    Distance:{" "}
                    {distance !== null && distance !== undefined
                      ? `${distance.toFixed(1)}cm`
                      : "No data"}
                  </Text>
                </View>
                {!isUltrasonicSensorConnected && isConnected && (
                  <Text style={[styles.sensorWarning, { color: colors.error }]}>
                    Ultrasonic sensor disconnected
                  </Text>
                )}
              </View>
            </View>
          </View>
        </StatCard>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            title="Water Temp"
            value={
              temperature !== null && temperature !== undefined
                ? temperature.toFixed(1)
                : "--"
            }
            unit={temperature !== null && temperature !== undefined ? "°C" : ""}
            icon="thermometer"
            color={
              isTemperatureSensorConnected ? colors.secondary : colors.error
            }
          />
          <StatCard title="WiFi Signal" icon="wifi" color={colors.primary}>
            <View style={styles.wifiContainer}>
              <View style={styles.wifiSignal}>
                {[1, 2, 3, 4].map((bar) => (
                  <View
                    key={bar}
                    style={[
                      styles.wifiBar,
                      {
                        height: bar * 5 + 5,
                        backgroundColor:
                          bar <= 3 ? colors.primary : colors.muted,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.wifiSignalText, { color: colors.text }]}>
                Strong
              </Text>
            </View>
          </StatCard>
        </View>

        {/* Dynamic Alerts */}
        <StatCard
          title={`Alerts ${alertCount > 0 ? `(${alertCount})` : ""}`}
          icon="bell"
          color={getAlertSectionColor()}
        >
          <View style={styles.alertsContainer}>
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <AlertItem
                  key={alert.id}
                  type={alert.type}
                  message={alert.message}
                  timestamp={alert.timestamp}
                  severity={alert.severity}
                  isResolved={alert.isResolved}
                />
              ))
            ) : (
              <View style={styles.noAlertsContainer}>
                <IconSymbol
                  name="checkmark.circle.fill"
                  size={32}
                  color={colors.success}
                />
                <Text style={[styles.noAlertsText, { color: colors.success }]}>
                  All systems normal
                </Text>
                <Text style={[styles.noAlertsSubtext, { color: colors.muted }]}>
                  No active alerts at this time
                </Text>
              </View>
            )}
          </View>
        </StatCard>

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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 80,
    height: 32,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  capacityContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  capacityInfo: {
    flex: 1,
  },
  capacityLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  capacityValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },
  sensorInfo: {
    gap: 6,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alertText: {
    fontSize: 12,
    fontWeight: "500",
  },
  sensorText: {
    fontSize: 12,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  wifiContainer: {
    alignItems: "center",
    gap: 12,
  },
  wifiSignal: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  wifiBar: {
    width: 4,
    borderRadius: 2,
  },
  wifiSignalText: {
    fontSize: 16,
    fontWeight: "600",
  },
  alertsContainer: {
    gap: 12,
  },
  noAlertsContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  noAlertsText: {
    fontSize: 16,
    fontWeight: "600",
  },
  noAlertsSubtext: {
    fontSize: 14,
  },
  bottomSpacing: {
    height: 100,
  },
  proxyStatusContainer: {
    gap: 12,
  },
  statusTextContainer: {
    flexDirection: "column",
  },
  statusSubText: {
    fontSize: 12,
  },
  helpBox: {
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  helpText: {
    fontSize: 14,
  },
  sensorWarning: {
    fontSize: 12,
    marginTop: 4,
  },
});
