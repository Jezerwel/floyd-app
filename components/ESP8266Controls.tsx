import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useESP8266 } from "../hooks/useESP8266Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const ESP8266Controls: React.FC = () => {
  const { isConnected, deviceData, toggleLED, toggleRelay, requestSensorData } =
    useESP8266();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [refreshInterval] = useState(2000); // 2 seconds by default

  // Auto-refresh sensor data (always enabled)
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      requestSensorData();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [isConnected, requestSensorData, refreshInterval]);

  const handleLEDToggle = () => {
    const success = toggleLED();
    if (!success) {
      Alert.alert("Error", "Failed to send LED command to ESP8266");
    }
  };

  const handleRelayToggle = () => {
    const success = toggleRelay();
    if (!success) {
      Alert.alert("Error", "Failed to send relay command to ESP8266");
    }
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleTimeString();
  };

  const getTemperatureEmoji = (temp?: number) => {
    if (temp === undefined) return "📡";
    if (temp < 0) return "❄️";
    if (temp < 15) return "🥶";
    if (temp < 25) return "😊";
    if (temp < 35) return "🌡️";
    return "🔥";
  };

  const getTemperatureStatus = (temp?: number) => {
    if (temp === undefined) return "No Data";
    if (temp < 0) return "Freezing";
    if (temp < 15) return "Cold";
    if (temp < 25) return "Comfortable";
    if (temp < 35) return "Warm";
    return "Hot";
  };

  if (!isConnected) {
    return (
      <StatCard
        title="Connection Required"
        icon="wifi.slash"
        color={colors.warning}
      >
        <View style={styles.warningContainer}>
          <IconSymbol
            name="exclamationmark.triangle.fill"
            size={32}
            color={colors.warning}
          />
          <Text style={[styles.warningText, { color: colors.text }]}>
            Please connect to ESP8266 first
          </Text>
          <Text style={[styles.warningSubtext, { color: colors.muted }]}>
            Use the connection form above to establish a WebSocket connection
          </Text>
        </View>
      </StatCard>
    );
  }

  return (
    <View style={styles.container}>
      {/* Temperature Sensor Display */}
      <StatCard
        title="DS18B20 Temperature Sensor"
        value={
          deviceData.temperature !== undefined
            ? `${deviceData.temperature.toFixed(1)}`
            : "--"
        }
        unit="°C"
        icon="thermometer"
        color={colors.primary}
      />

      {/* Temperature Status */}
      <StatCard
        title="Temperature Status"
        icon="info.circle"
        color={colors.secondary}
      >
        <View style={styles.temperatureStatusContainer}>
          <View style={styles.temperatureDisplay}>
            <Text style={styles.temperatureEmoji}>
              {getTemperatureEmoji(deviceData.temperature)}
            </Text>
            <Text
              style={[styles.temperatureStatusText, { color: colors.text }]}
            >
              {getTemperatureStatus(deviceData.temperature)}
            </Text>
          </View>

          <View style={styles.sensorStatusContainer}>
            <View style={styles.sensorStatusRow}>
              <View
                style={[
                  styles.statusIndicator,
                  {
                    backgroundColor: deviceData.sensorConnected
                      ? colors.success
                      : colors.error,
                  },
                ]}
              />
              <Text style={[styles.sensorStatusText, { color: colors.text }]}>
                Sensor:{" "}
                {deviceData.sensorConnected ? "Connected" : "Disconnected"}
              </Text>
            </View>
            <Text style={[styles.lastUpdateText, { color: colors.muted }]}>
              Last Update: {formatTimestamp(deviceData.lastUpdate)}
            </Text>
            <Text style={[styles.autoRefreshText, { color: colors.success }]}>
              Auto-refreshing every 2 seconds
            </Text>
          </View>
        </View>
      </StatCard>

      {/* Device Controls */}
      <StatCard
        title="Device Controls"
        icon="slider.horizontal.3"
        color={colors.primary}
      >
        <View style={styles.controlsContainer}>
          {/* LED Control */}
          <View
            style={[
              styles.controlItem,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.controlInfo}>
              <IconSymbol
                name="lightbulb.fill"
                size={24}
                color={deviceData.ledState ? colors.warning : colors.muted}
              />
              <View style={styles.controlTextContainer}>
                <Text style={[styles.controlTitle, { color: colors.text }]}>
                  LED Control
                </Text>
                <Text style={[styles.controlStatus, { color: colors.muted }]}>
                  Status: {deviceData.ledState ? "ON" : "OFF"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.controlButton,
                {
                  backgroundColor: deviceData.ledState
                    ? colors.warning
                    : colors.primary,
                },
              ]}
              onPress={handleLEDToggle}
            >
              <Text style={styles.controlButtonText}>
                {deviceData.ledState ? "Turn OFF" : "Turn ON"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Relay Control */}
          <View
            style={[
              styles.controlItem,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.controlInfo}>
              <IconSymbol
                name="power"
                size={24}
                color={deviceData.relayState ? colors.success : colors.muted}
              />
              <View style={styles.controlTextContainer}>
                <Text style={[styles.controlTitle, { color: colors.text }]}>
                  Relay Control
                </Text>
                <Text style={[styles.controlStatus, { color: colors.muted }]}>
                  Status: {deviceData.relayState ? "ON" : "OFF"}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.controlButton,
                {
                  backgroundColor: deviceData.relayState
                    ? colors.error
                    : colors.success,
                },
              ]}
              onPress={handleRelayToggle}
            >
              <Text style={styles.controlButtonText}>
                {deviceData.relayState ? "Turn OFF" : "Turn ON"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </StatCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  warningContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  warningText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  warningSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  temperatureStatusContainer: {
    gap: 16,
  },
  temperatureDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  temperatureEmoji: {
    fontSize: 32,
  },
  temperatureStatusText: {
    fontSize: 18,
    fontWeight: "600",
  },
  sensorStatusContainer: {
    gap: 6,
  },
  sensorStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sensorStatusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  lastUpdateText: {
    fontSize: 12,
    textAlign: "center",
  },
  autoRefreshText: {
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  controlsContainer: {
    gap: 12,
  },
  controlItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  controlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  controlTextContainer: {
    gap: 2,
  },
  controlTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  controlStatus: {
    fontSize: 14,
  },
  controlButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  controlButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default ESP8266Controls;
