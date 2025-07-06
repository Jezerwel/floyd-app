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
import { SavedDevice, useESP8266 } from "../hooks/useESP8266Context";
import { IconSymbol } from "./ui/IconSymbol";
import { StatCard } from "./ui/StatCard";

const validateWebSocketUrl = (
  url: string
): { isValid: boolean; error?: string } => {
  if (!url.trim()) {
    return { isValid: false, error: "URL cannot be empty" };
  }

  // Add ws:// prefix if not present
  const fullUrl = url.startsWith("ws://") ? url : `ws://${url}`;

  try {
    const parsedUrl = new URL(fullUrl);

    // Check if it's a valid WebSocket URL
    if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
      return {
        isValid: false,
        error: "Must be a WebSocket URL (ws:// or wss://)",
      };
    }

    // Check if hostname is valid
    if (!parsedUrl.hostname) {
      return { isValid: false, error: "Invalid hostname" };
    }

    // Check port range if specified
    if (parsedUrl.port) {
      const portNum = parseInt(parsedUrl.port);
      if (portNum < 1 || portNum > 65535) {
        return { isValid: false, error: "Port must be between 1 and 65535" };
      }
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: "Invalid URL format" };
  }
};

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
    const validation = validateWebSocketUrl(inputUrl);
    if (!validation.isValid) {
      Alert.alert(
        "Invalid URL",
        validation.error || "Please enter a valid WebSocket URL"
      );
      return;
    }

    const wsUrl = inputUrl.startsWith("ws://") ? inputUrl : `ws://${inputUrl}`;

    setDeviceUrl(wsUrl);
    connect();

    // Save device if name is provided
    if (deviceName.trim()) {
      const device: SavedDevice = {
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

  const handleQuickConnect = (device: SavedDevice) => {
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

  return (
    <View style={styles.container}>
      {/* Connection Form */}
      {!isConnected && (
        <StatCard title="Connect to Device" icon="link" color={colors.primary}>
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
                    Attempt {connectionAttempts}/5
                  </Text>
                )}
              </View>
            )}
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
              {isConnecting && <ActivityIndicator size="small" color="white" />}
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
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
