import ESP32Connection from "@/components/ESP32Connection";
import { AlertItem } from "@/components/ui/AlertItem";
import { AnimatedPercentage } from "@/components/ui/AnimatedValue";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { ConnectionBadge } from "@/components/ui/InlineError";
import { SkeletonCard, SkeletonStatRow } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import useAlerts from "@/hooks/useAlerts";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP32 } from "@/hooks/useESP32Context";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useMemo, useState } from "react";
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

const MOTOR_STATE_CONFIG: Record<
  string,
  { label: string; icon: string; colorKey: "success" | "primary" | "warning" | "error" | "muted" }
> = {
  idle: { label: "Idle", icon: "circle", colorKey: "muted" },
  pre_spin: { label: "Getting ready", icon: "arrow.triangle.2.circlepath", colorKey: "primary" },
  feeding: { label: "Feeding", icon: "gearshape.fill", colorKey: "success" },
  post_spin: { label: "Finishing up", icon: "arrow.triangle.2.circlepath", colorKey: "warning" },
  jam_clear: { label: "Unclogging", icon: "exclamationmark.triangle.fill", colorKey: "error" },
};

function getWifiRating(rssi: number): { label: string; bars: number } {
  if (rssi > -50) return { label: "Excellent", bars: 4 };
  if (rssi > -70) return { label: "Good", bars: 3 };
  return { label: "Weak", bars: 1 };
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme as keyof typeof Colors];

  const {
    deviceData,
    isConnected,
    isConnecting,
    requestSensorData,
    esp32Status,
  } = useESP32();

  const { alerts, alertCount, hasHighSeverityAlerts, hasMediumSeverityAlerts } =
    useAlerts();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isConnected) return;
    setIsRefreshing(true);
    const success = requestSensorData();
    const minRefreshTime = success ? 800 : 1500;
    setTimeout(() => {
      setIsRefreshing(false);
    }, minRefreshTime);
  }, [isRefreshing, isConnected, requestSensorData]);

  const isValidTemperature = (temp?: number): boolean => {
    return temp !== undefined && temp >= -40 && temp <= 85;
  };

  const isValidDistance = (distance?: number): boolean => {
    return distance !== undefined && distance >= 0 && distance <= 400;
  };

  const isValidFoodLevel = (level?: number): boolean => {
    return level !== undefined && level >= 0 && level <= 100;
  };

  const sensorValues = useMemo(
    () => ({
      temperature:
        isConnected && isValidTemperature(deviceData.temperature)
          ? deviceData.temperature
          : null,
      foodLevel:
        isConnected && isValidFoodLevel(deviceData.foodLevelPercentage)
          ? deviceData.foodLevelPercentage
          : null,
      distance:
        isConnected && isValidDistance(deviceData.distance)
          ? deviceData.distance
          : null,
      isTemperatureSensorConnected:
        isConnected && (deviceData.temperatureSensorConnected ?? false),
      isUltrasonicSensorConnected:
        isConnected && (deviceData.ultrasonicSensorConnected ?? false),
    }),
    [
      isConnected,
      deviceData.temperature,
      deviceData.foodLevelPercentage,
      deviceData.distance,
      deviceData.temperatureSensorConnected,
      deviceData.ultrasonicSensorConnected,
    ]
  );

  const {
    temperature,
    foodLevel,
    distance,
    isTemperatureSensorConnected,
    isUltrasonicSensorConnected,
  } = sensorValues;

  const alertSectionColor = useMemo(() => {
    if (hasHighSeverityAlerts) return colors.error;
    if (hasMediumSeverityAlerts) return colors.warning;
    return colors.success;
  }, [hasHighSeverityAlerts, hasMediumSeverityAlerts, colors]);

  const connectionStatus = useMemo(() => {
    if (!isConnected) {
      return {
        status: "Disconnected",
        color: colors.error,
        icon: "xmark.circle.fill",
      };
    }
    if (esp32Status === "connected") {
      return {
        status: "Online",
        color: colors.success,
        icon: "checkmark.circle.fill",
      };
    } else if (esp32Status === "disconnected") {
      return {
        status: "Cloud online, feeder offline",
        color: colors.warning,
        icon: "exclamationmark.triangle.fill",
      };
    }
    return {
      status: "Connecting...",
      color: colors.success,
      icon: "checkmark.circle.fill",
    };
  }, [isConnected, esp32Status, colors]);

  const motorState = deviceData.motorState ?? "idle";
  const motorConfig = MOTOR_STATE_CONFIG[motorState] ?? MOTOR_STATE_CONFIG.idle;
  const motorIsActive = motorState !== "idle";

  const wifiRssi = deviceData.wifiRssi;
  const hasWifiRssi = wifiRssi !== undefined && wifiRssi !== null;
  const wifiRating = hasWifiRssi ? getWifiRating(wifiRssi!) : null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style="dark" backgroundColor={colors.background} />

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
                <ConnectionBadge
                  status={
                    isConnecting
                      ? "connecting"
                      : isConnected
                      ? "connected"
                      : "disconnected"
                  }
                  label={connectionStatus.status}
                />
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.refreshButton,
              {
                backgroundColor: isConnected ? colors.primary : colors.muted,
                opacity: isRefreshing ? 0.7 : 1,
              },
            ]}
            onPress={handleRefresh}
            disabled={!isConnected || isRefreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh sensor data"
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
        <ESP32Connection />

        {isConnecting && !isConnected && (
          <>
            <SkeletonCard showCircle />
            <SkeletonStatRow count={2} />
            <SkeletonCard lines={4} />
          </>
        )}

        {isConnected && (
        <StatCard
          title="Device Status"
          icon="globe"
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
                Cloud connection: Online
              </Text>
            </View>
            <View style={styles.statusRow}>
              <IconSymbol
                name={
                  esp32Status === "connected"
                    ? "checkmark.circle.fill"
                    : "xmark.circle.fill"
                }
                size={16}
                color={
                  esp32Status === "connected"
                    ? colors.success
                    : colors.error
                }
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
                Feeder:{" "}
                {esp32Status === "connected"
                  ? "Online"
                  : esp32Status === "disconnected"
                  ? "Offline"
                  : "Unknown"}
              </Text>
            </View>
            {esp32Status === "disconnected" && (
              <View
                style={[
                  styles.helpBox,
                  { backgroundColor: colors.warning + "20" },
                ]}
              >
                <Text style={[styles.helpText, { color: colors.text }]}>
                  The cloud is connected, but the feeder is not responding.
                  Check power and WiFi connection.
                </Text>
              </View>
            )}
          </View>
        </StatCard>
        )}

        <StatCard
          title="Motor Status"
          icon="gearshape.fill"
          color={colors[motorConfig.colorKey]}
        >
          <View style={styles.motorStatusContainer}>
            <View style={styles.motorStateRow}>
              <IconSymbol
                name={motorConfig.icon as any}
                size={20}
                color={colors[motorConfig.colorKey]}
              />
              <Text
                style={[
                  styles.motorStateText,
                  { color: colors[motorConfig.colorKey] },
                ]}
              >
                {motorConfig.label}
              </Text>
            </View>
            {motorIsActive && (
              <View style={styles.motorSpeeds}>
                <View style={styles.speedRow}>
                  <Text style={[styles.speedLabel, { color: colors.muted }]}>
                    Feed
                  </Text>
                  <View style={styles.speedBarContainer}>
                    <View
                      style={[
                        styles.speedBarFill,
                        {
                          width: `${deviceData.augerSpeed ?? 0}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.speedValue, { color: colors.text }]}>
                    {deviceData.augerSpeed ?? 0}%
                  </Text>
                </View>
                <View style={styles.speedRow}>
                  <Text style={[styles.speedLabel, { color: colors.muted }]}>
                    Spread
                  </Text>
                  <View style={styles.speedBarContainer}>
                    <View
                      style={[
                        styles.speedBarFill,
                        {
                          width: `${deviceData.impellerSpeed ?? 0}%`,
                          backgroundColor: colors.secondary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.speedValue, { color: colors.text }]}>
                    {deviceData.impellerSpeed ?? 0}%
                  </Text>
                </View>
              </View>
            )}
          </View>
        </StatCard>

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
              <AnimatedPercentage
                value={foodLevel}
                color={colors.text}
                size="large"
              />
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
                    Level:{" "}
                    {distance !== null && distance !== undefined
                      ? `${distance.toFixed(1)}cm`
                      : "No data"}
                  </Text>
                </View>
                {!isUltrasonicSensorConnected && isConnected && (
                  <Text style={[styles.sensorWarning, { color: colors.error }]}>
                    Food level sensor disconnected
                  </Text>
                )}
              </View>
            </View>
          </View>
        </StatCard>

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
                          wifiRating && bar <= wifiRating.bars
                            ? colors.primary
                            : colors.muted,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.wifiSignalText, { color: colors.text }]}>
                {hasWifiRssi
                  ? `${wifiRssi} dBm · ${wifiRating!.label}`
                  : "No signal"}
              </Text>
            </View>
          </StatCard>
        </View>

        <StatCard
          title={`Alerts ${alertCount > 0 ? `(${alertCount})` : ""}`}
          icon="bell"
          color={alertSectionColor}
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
  motorStatusContainer: {
    gap: 12,
  },
  motorStateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  motorStateText: {
    fontSize: 16,
    fontWeight: "600",
  },
  motorSpeeds: {
    gap: 8,
    paddingTop: 4,
  },
  speedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  speedLabel: {
    fontSize: 13,
    fontWeight: "500",
    width: 60,
  },
  speedBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  speedBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  speedValue: {
    fontSize: 13,
    fontWeight: "600",
    width: 36,
    textAlign: "right",
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
  sensorInfo: {
    gap: 6,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  latencyRow: {
    marginTop: 4,
  },
  latencyText: {
    fontSize: 11,
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
