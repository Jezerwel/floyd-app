import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { TimerControl } from "@/components/ui/TimerControl";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { DEFAULT_TIMER_STATE, TimerState } from "@/types/timer";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ControlsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const {
    toggleRelay,
    isConnected,
    deviceData,
    isProxyConnection,
    esp8266Status,
  } = useESP8266();

  // Paddle on/off states
  const [leftPaddleOn, setLeftPaddleOn] = useState(false);
  const [rightPaddleOn, setRightPaddleOn] = useState(false);

  // Timer states
  const [timerState, setTimerState] = useState<TimerState>(DEFAULT_TIMER_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer countdown effect
  useEffect(() => {
    if (timerState.isActive && timerState.remainingTime > 0) {
      timerRef.current = setInterval(() => {
        setTimerState((prev) => {
          const newRemainingTime = prev.remainingTime - 1;

          if (newRemainingTime <= 0) {
            // Timer completed - stop feeding
            handleStopTimedFeeding();
            return {
              ...prev,
              isActive: false,
              remainingTime: 0,
            };
          }

          return {
            ...prev,
            remainingTime: newRemainingTime,
          };
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timerState.isActive, timerState.remainingTime]);

  const handleLeftPaddleToggle = () => {
    setLeftPaddleOn(!leftPaddleOn);
    // TODO: Send paddle control command to ESP8266
  };

  const handleRightPaddleToggle = () => {
    setRightPaddleOn(!rightPaddleOn);
    // TODO: Send paddle control command to ESP8266
  };

  const handleToggleDispenser = () => {
    if (!isConnected) {
      Alert.alert(
        "Error",
        "Not connected to feeder device. Please check your connection."
      );
      return;
    }

    // Additional check for proxy connections
    if (isProxyConnection && esp8266Status !== "connected") {
      Alert.alert(
        "ESP8266 Not Available",
        "The proxy server is connected, but the ESP8266 hardware is not responding. Please check the device power and WiFi connection."
      );
      return;
    }

    // Don't allow manual control while timer is active
    if (timerState.isActive) {
      Alert.alert(
        "Timer Active",
        "A timer is currently running. Please stop the timer first to use manual controls."
      );
      return;
    }

    const isCurrentlyActive = deviceData.relayState === true;
    const action = isCurrentlyActive ? "stop" : "start";
    const actionText = isCurrentlyActive ? "Stop" : "Start";

    Alert.alert(
      `${actionText} Food Dispenser`,
      `This will ${action} the food dispenser. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: actionText,
          style: isCurrentlyActive ? "destructive" : "default",
          onPress: () => {
            const success = toggleRelay();
            if (success) {
              Alert.alert(
                "Success",
                `Food dispenser ${isCurrentlyActive ? "stopped" : "activated"}!`
              );
            } else {
              Alert.alert(
                "Error",
                `Failed to ${action} dispenser. Please try again.`
              );
            }
          },
        },
      ]
    );
  };

  const handleStartTimedFeeding = (totalSeconds: number) => {
    if (!isConnected) {
      Alert.alert(
        "Error",
        "Not connected to feeder device. Please check your connection."
      );
      return;
    }

    if (isProxyConnection && esp8266Status !== "connected") {
      Alert.alert(
        "ESP8266 Not Available",
        "The proxy server is connected, but the ESP8266 hardware is not responding. Please check the device power and WiFi connection."
      );
      return;
    }

    // Don't allow timer if relay is already active
    if (deviceData.relayState === true) {
      Alert.alert(
        "Dispenser Already Active",
        "The food dispenser is already running. Please stop it first before starting a timer."
      );
      return;
    }

    // Start the relay
    const success = toggleRelay();
    if (success) {
      setTimerState({
        isActive: true,
        remainingTime: totalSeconds,
        totalTime: totalSeconds,
        startTime: Date.now(),
      });

      Alert.alert(
        "Timer Started",
        `Food dispenser started with ${Math.floor(totalSeconds / 60)}:${(
          totalSeconds % 60
        )
          .toString()
          .padStart(2, "0")} timer`
      );
    } else {
      Alert.alert("Error", "Failed to start dispenser. Please try again.");
    }
  };

  const handleStopTimedFeeding = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop the relay if it's active
    if (deviceData.relayState === true) {
      const success = toggleRelay();
      if (success) {
        Alert.alert(
          "Timer Stopped",
          "Food dispenser stopped and timer cancelled."
        );
      } else {
        Alert.alert(
          "Warning",
          "Timer cancelled but failed to stop dispenser. Please check manually."
        );
      }
    }

    setTimerState(DEFAULT_TIMER_STATE);
  };

  // Determine if controls should be enabled
  const controlsEnabled =
    isConnected && (!isProxyConnection || esp8266Status === "connected");

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <IconSymbol
          name="slider.horizontal.3"
          size={24}
          color={colors.primary}
        />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Feeder Controls
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Connection Status Warning for Proxy */}
        {isProxyConnection && esp8266Status !== "connected" && (
          <StatCard
            title="Hardware Status"
            icon="exclamationmark.triangle.fill"
            color={colors.warning}
          >
            <View style={styles.warningContainer}>
              <Text style={[styles.warningText, { color: colors.text }]}>
                ESP8266 hardware is not responding. Controls are disabled until
                the hardware reconnects.
              </Text>
              <Text style={[styles.warningSubtext, { color: colors.muted }]}>
                Check device power and WiFi connection.
              </Text>
            </View>
          </StatCard>
        )}

        {/* Paddle Toggle Controls */}
        <StatCard title="Paddle Controls" icon="gear" color={colors.primary}>
          <View style={styles.paddleContainer}>
            {/* Left Paddle Toggle */}
            <TouchableOpacity
              style={[
                styles.paddleToggle,
                {
                  backgroundColor: leftPaddleOn ? colors.primary : colors.card,
                  borderColor: leftPaddleOn ? colors.primary : colors.border,
                  opacity: controlsEnabled ? 1 : 0.5,
                },
              ]}
              onPress={handleLeftPaddleToggle}
              disabled={!controlsEnabled}
            >
              <Text
                style={[
                  styles.paddleTitle,
                  { color: leftPaddleOn ? "white" : colors.text },
                ]}
              >
                Left Paddle
              </Text>
              <Text
                style={[
                  styles.paddleStatus,
                  { color: leftPaddleOn ? "white" : colors.muted },
                ]}
              >
                {leftPaddleOn ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>

            {/* Right Paddle Toggle */}
            <TouchableOpacity
              style={[
                styles.paddleToggle,
                {
                  backgroundColor: rightPaddleOn ? colors.primary : colors.card,
                  borderColor: rightPaddleOn ? colors.primary : colors.border,
                  opacity: controlsEnabled ? 1 : 0.5,
                },
              ]}
              onPress={handleRightPaddleToggle}
              disabled={!controlsEnabled}
            >
              <Text
                style={[
                  styles.paddleTitle,
                  { color: rightPaddleOn ? "white" : colors.text },
                ]}
              >
                Right Paddle
              </Text>
              <Text
                style={[
                  styles.paddleStatus,
                  { color: rightPaddleOn ? "white" : colors.muted },
                ]}
              >
                {rightPaddleOn ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          {!controlsEnabled && (
            <Text style={[styles.disabledText, { color: colors.muted }]}>
              Controls disabled -{" "}
              {!isConnected ? "not connected" : "ESP8266 hardware offline"}
            </Text>
          )}
        </StatCard>

        {/* Timed Feeding Controls */}
        <StatCard title="Timed Feeding" icon="clock" color={colors.secondary}>
          <TimerControl
            onStartTimer={handleStartTimedFeeding}
            onStopTimer={handleStopTimedFeeding}
            isTimerActive={timerState.isActive}
            remainingTime={timerState.remainingTime}
            totalTime={timerState.totalTime}
            disabled={!controlsEnabled}
            colors={colors}
          />

          {!controlsEnabled && (
            <Text style={[styles.disabledText, { color: colors.muted }]}>
              Timer disabled -{" "}
              {!isConnected ? "not connected" : "ESP8266 hardware offline"}
            </Text>
          )}
        </StatCard>

        {/* Manual Feed */}
        <StatCard title="Manual Feed" icon="power" color={colors.success}>
          <View style={styles.manualFeedContent}>
            {/* Dispenser Status */}
            {isConnected && (
              <View style={styles.statusContainer}>
                <View style={styles.statusRow}>
                  <IconSymbol
                    name="power"
                    size={16}
                    color={
                      deviceData.relayState ? colors.success : colors.muted
                    }
                  />
                  <Text style={[styles.statusText, { color: colors.text }]}>
                    Dispenser: {deviceData.relayState ? "ACTIVE" : "INACTIVE"}
                  </Text>
                </View>
                {deviceData.motorOpened !== undefined && (
                  <View style={styles.statusRow}>
                    <IconSymbol
                      name="gear"
                      size={16}
                      color={
                        deviceData.motorOpened ? colors.success : colors.muted
                      }
                    />
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      Motor: {deviceData.motorOpened ? "OPENED" : "CLOSED"}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Timer Status Warning */}
            {timerState.isActive && (
              <View
                style={[
                  styles.helpContainer,
                  { backgroundColor: colors.warning + "20" },
                ]}
              >
                <Text style={[styles.helpText, { color: colors.text }]}>
                  ⏱️ Timer is active. Manual controls are disabled until timer
                  completes or is stopped.
                </Text>
              </View>
            )}

            {/* Feed Button */}
            <TouchableOpacity
              style={[
                styles.feedButton,
                {
                  backgroundColor:
                    controlsEnabled && !timerState.isActive
                      ? deviceData.relayState
                        ? colors.error
                        : colors.success
                      : colors.muted,
                  opacity: controlsEnabled && !timerState.isActive ? 1 : 0.5,
                },
              ]}
              onPress={handleToggleDispenser}
              disabled={!controlsEnabled || timerState.isActive}
            >
              <IconSymbol
                name={deviceData.relayState ? "xmark" : "power"}
                size={24}
                color="white"
              />
              <Text style={styles.feedButtonText}>
                {deviceData.relayState ? "Stop Feeding" : "Start Feeding"}
              </Text>
            </TouchableOpacity>

            {!controlsEnabled && !timerState.isActive && (
              <View
                style={[
                  styles.helpContainer,
                  { backgroundColor: colors.warning + "20" },
                ]}
              >
                <Text style={[styles.helpText, { color: colors.text }]}>
                  💡{" "}
                  {!isConnected
                    ? "Connect to the feeder to control the dispenser."
                    : "ESP8266 hardware is offline. Check device connection."}
                </Text>
              </View>
            )}
          </View>
        </StatCard>
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
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  paddleContainer: {
    flexDirection: "row",
    gap: 16,
    minHeight: 180,
  },
  paddleToggle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 24,
    borderRadius: 12,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
  },
  paddleTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  paddleStatus: {
    fontSize: 14,
    fontWeight: "bold",
  },
  manualFeedContent: {
    gap: 16,
  },
  dispenseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dispenseButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  connectionWarning: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  statusContainer: {
    gap: 8,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  warningContainer: {
    padding: 16,
    gap: 8,
  },
  warningText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  warningSubtext: {
    fontSize: 14,
  },
  disabledText: {
    fontSize: 14,
    textAlign: "center",
    fontStyle: "italic",
  },
  helpContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  helpText: {
    fontSize: 14,
    textAlign: "center",
  },
  feedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  feedButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});
