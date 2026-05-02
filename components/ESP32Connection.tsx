import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useESP32 } from "../hooks/useESP32Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const ESP32Connection: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    chipId,
    connect,
    disconnect,
    resetConnection,
    publishCommand,
    setChipId,
    mqttBrokerUrl,
  } = useESP32();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleProvision = () => {
    router.push("/provision");
  };

  const handleReconfigure = useCallback(() => {
    publishCommand("restart_provisioning");
    setChipId(null);
    AsyncStorage.removeItem("floydMqttPassword").catch(console.error);
    router.push("/provision");
  }, [publishCommand, setChipId]);

  return (
    <View style={styles.container}>
      {!isConnected && (
        <StatCard title="Cloud Connection" icon="globe" color={colors.primary}>
          <View style={styles.formContainer}>
            {error && (
              <View
                style={[
                  styles.errorContainer,
                  { backgroundColor: colors.error + "20" },
                ]}
              >
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {error}
                </Text>
                {connectionAttempts > 0 && (
                  <Text style={[styles.errorSubtext, { color: colors.error }]}>
                    Attempt {connectionAttempts}
                  </Text>
                )}
                <View style={styles.troubleshootingContainer}>
                  <Text
                    style={[
                      styles.troubleshootingTitle,
                      { color: colors.warning },
                    ]}
                  >
                    Troubleshooting Tips:
                  </Text>
                  <Text
                    style={[
                      styles.troubleshootingText,
                      { color: colors.muted },
                    ]}
                  >
                    • Check your internet connection{"\n"}• Confirm the feeder is
                    powered on{"\n"}• Re-run provisioning if this is a new device
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.cloudInfoContainer}>
              <View
                style={[
                  styles.cloudIconContainer,
                  { backgroundColor: colors.primary + "15" },
                ]}
              >
                <IconSymbol name="globe" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.cloudTitle, { color: colors.text }]}>
                Floyd Feeder Cloud
              </Text>
              <Text style={[styles.cloudSubtitle, { color: colors.muted }]}>
                {chipId ? "Waiting for the feeder to come online" : "Provision a feeder to connect from anywhere"}
              </Text>
              <Text style={[styles.serverUrl, { color: colors.muted }]}>
                {chipId ? `Device ${chipId}` : "No device claimed"}
              </Text>
              <Text style={[styles.serverUrl, { color: colors.muted }]}>
                {mqttBrokerUrl}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.connectButton,
                {
                  backgroundColor: isConnecting || !chipId ? colors.muted : colors.primary,
                },
              ]}
              onPress={handleConnect}
              disabled={isConnecting || !chipId}
              accessibilityRole="button"
              accessibilityLabel="Reconnect to cloud"
            >
              {isConnecting ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.connectButtonText}>Connecting...</Text>
                </>
              ) : (
                <>
                  <IconSymbol name="link" size={18} color="white" />
                  <Text style={styles.connectButtonText}>Reconnect</Text>
                </>
              )}
            </TouchableOpacity>

            {!chipId && (
              <TouchableOpacity
                style={[styles.connectButton, { backgroundColor: colors.success }]}
                onPress={handleProvision}
                accessibilityRole="button"
                accessibilityLabel="Open feeder provisioning"
              >
                <IconSymbol name="link" size={18} color="white" />
                <Text style={styles.connectButtonText}>Set Up Feeder</Text>
              </TouchableOpacity>
            )}
          </View>
        </StatCard>
      )}

      {isConnected && (
        <StatCard
          title="Connected"
          icon="checkmark.circle.fill"
          color={colors.success}
        >
          <View style={styles.connectedContainer}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: colors.success },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
              Online{chipId ? ` · ${chipId}` : ""}
              </Text>
            </View>
            <Text style={[styles.serverUrl, { color: colors.muted }]}>
              {mqttBrokerUrl}
            </Text>

            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.error }]}
                onPress={handleDisconnect}
                accessibilityRole="button"
                accessibilityLabel="Disconnect from cloud"
              >
                <IconSymbol name="xmark" size={16} color="white" />
                <Text style={styles.actionButtonText}>Disconnect</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.warning },
                ]}
                onPress={resetConnection}
                accessibilityRole="button"
                accessibilityLabel="Reconnect to cloud"
              >
                <IconSymbol name="arrow.clockwise" size={16} color="white" />
                <Text style={styles.actionButtonText}>Reconnect</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.reconfigureButton, { borderColor: colors.muted }]}
              onPress={handleReconfigure}
              accessibilityRole="button"
              accessibilityLabel="Reconfigure feeder WiFi"
            >
              <IconSymbol name="gear" size={14} color={colors.muted} />
              <Text style={[styles.reconfigureText, { color: colors.muted }]}>Reconfigure Device</Text>
            </TouchableOpacity>
          </View>
        </StatCard>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "500",
  },
  errorSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  formContainer: {
    gap: 16,
  },
  cloudInfoContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  cloudIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  cloudTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  cloudSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  serverUrl: {
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
  },
  connectButton: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  connectButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  connectedContainer: {
    gap: 12,
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  reconfigureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  reconfigureText: {
    fontSize: 12,
    fontWeight: "500",
  },
  troubleshootingContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ffffff20",
  },
  troubleshootingTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  troubleshootingText: {
    fontSize: 12,
    lineHeight: 18,
  },
});

export default ESP32Connection;
