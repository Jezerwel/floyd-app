import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useESP8266 } from "../hooks/useESP8266Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const ESP8266Connection: React.FC = () => {
  const {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    connect,
    disconnect,
    resetConnection,
    setDeviceUrl,
    deviceUrl,
    savedDevices,
    addSavedDevice,
    removeSavedDevice,
  } = useESP8266();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  const [inputUrl, setInputUrl] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showSavedDevices, setShowSavedDevices] = useState(false);

  const handleConnect = () => {
    if (!inputUrl.trim()) {
      Alert.alert("Error", "Please enter a valid WebSocket URL");
      return;
    }

    // Validate URL format
    const wsUrl = inputUrl.startsWith("ws://") ? inputUrl : `ws://${inputUrl}`;

    setDeviceUrl(wsUrl);
    connect();

    // Save device if name is provided
    if (deviceName.trim()) {
      const device = {
        id: Date.now().toString(),
        name: deviceName.trim(),
        url: wsUrl,
      };
      addSavedDevice(device);
      setDeviceName("");
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleQuickConnect = (device: any) => {
    setInputUrl(device.url);
    setDeviceUrl(device.url);
    connect();
  };

  const handleRemoveDevice = (deviceId: string) => {
    Alert.alert(
      "Remove Device",
      "Are you sure you want to remove this saved device?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeSavedDevice(deviceId),
        },
      ]
    );
  };

  const getConnectionStatusColor = () => {
    if (isConnected) return colors.success;
    if (isConnecting) return colors.warning;
    if (error) return colors.error;
    return colors.muted;
  };

  const getConnectionStatusIcon = () => {
    if (isConnected) return "checkmark.circle.fill";
    if (isConnecting) return "arrow.clockwise";
    if (error) return "exclamationmark.triangle.fill";
    return "circle";
  };

  const getConnectionStatusText = () => {
    if (isConnected) return "Connected";
    if (isConnecting) return "Connecting...";
    if (error) return "Connection Failed";
    return "Not Connected";
  };

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <StatCard
        title="ESP8266 Connection"
        icon={getConnectionStatusIcon()}
        color={getConnectionStatusColor()}
      >
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getConnectionStatusColor() },
              ]}
            />
            <Text style={[styles.statusText, { color: colors.text }]}>
              {getConnectionStatusText()}
            </Text>
            {isConnecting && (
              <ActivityIndicator
                size="small"
                color={getConnectionStatusColor()}
                style={styles.loadingSpinner}
              />
            )}
          </View>

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
                  Attempt {connectionAttempts}/5
                </Text>
              )}
            </View>
          )}

          {isConnected && deviceUrl && (
            <View
              style={[
                styles.connectedContainer,
                { backgroundColor: colors.success + "20" },
              ]}
            >
              <Text style={[styles.connectedText, { color: colors.success }]}>
                Connected to: {deviceUrl}
              </Text>
            </View>
          )}
        </View>
      </StatCard>

      {/* Connection Form */}
      {!isConnected && (
        <StatCard title="Connect to Device" icon="link" color={colors.primary}>
          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                ESP8266 WebSocket URL
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="192.168.1.100:81"
                placeholderTextColor={colors.muted}
                value={inputUrl}
                onChangeText={setInputUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.inputHint, { color: colors.muted }]}>
                Enter IP address with port (e.g., 192.168.1.100:81)
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Device Name (Optional)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder="e.g., Fish Tank Sensor"
                placeholderTextColor={colors.muted}
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.connectButton,
                {
                  backgroundColor: isConnecting ? colors.muted : colors.primary,
                },
              ]}
              onPress={handleConnect}
              disabled={isConnecting}
            >
              <Text style={styles.connectButtonText}>
                {isConnecting ? "Connecting..." : "Connect"}
              </Text>
            </TouchableOpacity>
          </View>
        </StatCard>
      )}

      {/* Connected Device Actions */}
      {isConnected && (
        <StatCard title="Device Actions" icon="gear" color={colors.secondary}>
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.error }]}
              onPress={handleDisconnect}
            >
              <IconSymbol name="xmark" size={16} color="white" />
              <Text style={styles.actionButtonText}>Disconnect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.warning }]}
              onPress={resetConnection}
            >
              <IconSymbol name="arrow.clockwise" size={16} color="white" />
              <Text style={styles.actionButtonText}>Reconnect</Text>
            </TouchableOpacity>
          </View>
        </StatCard>
      )}

      {/* Saved Devices */}
      {savedDevices.length > 0 && (
        <StatCard
          title="Saved Devices"
          icon="bookmark.fill"
          color={colors.secondary}
        >
          <View style={styles.savedDevicesContainer}>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => setShowSavedDevices(!showSavedDevices)}
            >
              <Text
                style={[styles.toggleButtonText, { color: colors.primary }]}
              >
                {showSavedDevices ? "Hide" : "Show"} Saved Devices
              </Text>
              <IconSymbol
                name={showSavedDevices ? "chevron.up" : "chevron.down"}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>

            {showSavedDevices && (
              <View style={styles.devicesList}>
                {savedDevices.map((device) => (
                  <View
                    key={device.id}
                    style={[
                      styles.deviceItem,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.deviceInfo}>
                      <Text style={[styles.deviceName, { color: colors.text }]}>
                        {device.name}
                      </Text>
                      <Text style={[styles.deviceUrl, { color: colors.muted }]}>
                        {device.url}
                      </Text>
                      {device.lastConnected && (
                        <Text
                          style={[styles.deviceDate, { color: colors.muted }]}
                        >
                          Last:{" "}
                          {new Date(device.lastConnected).toLocaleDateString()}
                        </Text>
                      )}
                    </View>

                    <View style={styles.deviceActions}>
                      <TouchableOpacity
                        style={[
                          styles.deviceActionButton,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => handleQuickConnect(device)}
                        disabled={isConnecting}
                      >
                        <IconSymbol name="link" size={14} color="white" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.deviceActionButton,
                          { backgroundColor: colors.error },
                        ]}
                        onPress={() => handleRemoveDevice(device.id)}
                      >
                        <IconSymbol name="trash" size={14} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </StatCard>
      )}

      {/* Quick Setup Guide */}
      <StatCard
        title="Quick Setup Guide"
        icon="questionmark.circle"
        color={colors.muted}
      >
        <View style={styles.guideContainer}>
          <Text style={[styles.guideText, { color: colors.text }]}>
            1. Upload the Arduino code to your ESP8266
          </Text>
          <Text style={[styles.guideText, { color: colors.text }]}>
            2. Connect ESP8266 to your WiFi network
          </Text>
          <Text style={[styles.guideText, { color: colors.text }]}>
            3. Find ESP8266&apos;s IP address in Serial Monitor
          </Text>
          <Text style={[styles.guideText, { color: colors.text }]}>
            4. Enter IP:81 in the connection form above
          </Text>
        </View>
      </StatCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  statusContainer: {
    gap: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  loadingSpinner: {
    marginLeft: 8,
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
  connectedContainer: {
    padding: 12,
    borderRadius: 8,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: "500",
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputHint: {
    fontSize: 12,
  },
  connectButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  connectButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 12,
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
  savedDevicesContainer: {
    gap: 12,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  devicesList: {
    gap: 8,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  deviceUrl: {
    fontSize: 12,
  },
  deviceDate: {
    fontSize: 11,
  },
  deviceActions: {
    flexDirection: "row",
    gap: 8,
  },
  deviceActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  guideContainer: {
    gap: 8,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
  },
});

export default ESP8266Connection;
