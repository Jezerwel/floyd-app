import { AlertItem } from "@/components/ui/AlertItem";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
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
  const { deviceData, isConnected, requestSensorData } = useESP8266();

  // Local state for UI controls
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    requestSensorData();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1500);
  };

  // Auto-refresh sensor data every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        requestSensorData();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected, requestSensorData]);

  // Get real sensor values or fallback to defaults
  const temperature = deviceData.temperature ?? 24.5;
  const foodLevel = deviceData.foodLevelPercentage ?? 75;
  const distance = deviceData.distance ?? 5.2;
  const isTemperatureSensorConnected =
    deviceData.temperatureSensorConnected ?? false;
  const isUltrasonicSensorConnected =
    deviceData.ultrasonicSensorConnected ?? false;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style="dark" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerContent}>
          <View style={styles.deviceInfo}>
            <View
              style={[
                styles.deviceIconContainer,
                { backgroundColor: `${colors.primary}15` },
              ]}
            >
              <IconSymbol name="wifi" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.deviceTitle, { color: colors.text }]}>
                FLOYD 1.0
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isConnected
                        ? colors.success
                        : colors.error,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: isConnected ? colors.success : colors.error,
                    },
                  ]}
                >
                  {isConnected ? "Connected" : "Disconnected"}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.primary }]}
            onPress={handleRefresh}
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
        {/* Feeder Capacity - Now using real ultrasonic sensor data */}
        <StatCard
          title="Feeder Capacity"
          icon="archivebox.fill"
          color={colors.primary}
        >
          <View style={styles.capacityContainer}>
            <CircularProgress percentage={foodLevel} color={colors.primary} />
            <View style={styles.capacityInfo}>
              <Text style={[styles.capacityLabel, { color: colors.muted }]}>
                Food Remaining
              </Text>
              <Text style={[styles.capacityValue, { color: colors.text }]}>
                {foodLevel.toFixed(1)}%
              </Text>
              <View style={styles.sensorInfo}>
                <View style={styles.alertRow}>
                  <IconSymbol
                    name={
                      isUltrasonicSensorConnected
                        ? "checkmark.circle.fill"
                        : "xmark.circle.fill"
                    }
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
                    Distance: {distance.toFixed(1)} cm
                  </Text>
                </View>
                <View style={styles.alertRow}>
                  <IconSymbol
                    name="bell.fill"
                    size={14}
                    color={colors.success}
                  />
                  <Text style={[styles.alertText, { color: colors.success }]}>
                    All alerts enabled by default
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </StatCard>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            title="Water Temp"
            value={temperature.toFixed(1)}
            unit="°C"
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

        {/* Recent Alerts */}
        <StatCard title="Recent Alerts" icon="bell" color={colors.warning}>
          <View style={styles.alertsContainer}>
            <AlertItem
              type="LOW_FOOD"
              message="Food level dropped to 15%. Consider refilling soon."
              timestamp="2 hours ago"
              severity="MEDIUM"
              isResolved={false}
            />
            <AlertItem
              type="TEMPERATURE"
              message="Water temperature reached 32°C. Check conditions."
              timestamp="5 hours ago"
              severity="LOW"
              isResolved={true}
            />
            <AlertItem
              type="SYSTEM"
              message="Ultrasonic sensor reconnected successfully."
              timestamp="1 day ago"
              severity="LOW"
              isResolved={true}
            />
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
  deviceTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
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
  bottomSpacing: {
    height: 100,
  },
});
