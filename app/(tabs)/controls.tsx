import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { TimerControl } from "@/components/ui/TimerControl";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { DEFAULT_TIMER_STATE, TimerState } from "@/types/timer";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const { toggleRelay, isConnected, deviceData, esp8266Status } = useESP8266();

  const [leftPaddleOn, setLeftPaddleOn] = useState(false);
  const [rightPaddleOn, setRightPaddleOn] = useState(false);
  const [timerState, setTimerState] = useState<TimerState>(DEFAULT_TIMER_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStopTimedFeeding = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (deviceData.relayState === true) {
      toggleRelay();
    }
    setTimerState(DEFAULT_TIMER_STATE);
  }, [deviceData.relayState, toggleRelay]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timerState.isActive && timerState.remainingTime > 0) {
      timerRef.current = setInterval(() => {
        setTimerState((prev) => {
          const newRemainingTime = prev.remainingTime - 1;
          if (newRemainingTime <= 0) {
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
  }, [timerState.isActive, timerState.remainingTime, handleStopTimedFeeding]);

  const handleLeftPaddleToggle = () => {
    setLeftPaddleOn(!leftPaddleOn);
  };

  const handleRightPaddleToggle = () => {
    setRightPaddleOn(!rightPaddleOn);
  };

  const handleToggleDispenser = () => {
    if (!isConnected) {
      Alert.alert(
        "Error",
        "Not connected to cloud server. Please check your connection."
      );
      return;
    }
    if (esp8266Status !== "connected") {
      Alert.alert(
        "ESP8266 Not Available",
        "The cloud server is connected, but the ESP8266 hardware is not responding. Please check the device power and WiFi connection."
      );
      return;
    }
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
        "Not connected to cloud server. Please check your connection."
      );
      return;
    }
    if (esp8266Status !== "connected") {
      Alert.alert(
        "ESP8266 Not Available",
        "The cloud server is connected, but the ESP8266 hardware is not responding. Please check the device power and WiFi connection."
      );
      return;
    }
    if (deviceData.relayState === true) {
      Alert.alert(
        "Dispenser Already Active",
        "The food dispenser is already running. Please stop it first before starting a timer."
      );
      return;
    }
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

  const handleStopTimedFeedingWithAlert = () => {
    handleStopTimedFeeding();
    Alert.alert("Timer Stopped", "Food dispenser stopped and timer cancelled.");
  };

  const controlsEnabled = isConnected && esp8266Status === "connected";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

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
        {esp8266Status !== "connected" && isConnected && (
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

        <StatCard title="Paddle Controls" icon="gear" color={colors.primary}>
          <View style={styles.paddleContainer}>
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
              accessibilityRole="button"
              accessibilityLabel="Toggle left paddle"
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
              accessibilityRole="button"
              accessibilityLabel="Toggle right paddle"
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

        <StatCard title="Timed Feeding" icon="clock" color={colors.secondary}>
          <TimerControl
            onStartTimer={handleStartTimedFeeding}
            onStopTimer={handleStopTimedFeedingWithAlert}
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

        <StatCard title="Manual Feed" icon="power" color={colors.success}>
          <View style={styles.manualFeedContent}>
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
              accessibilityRole="button"
              accessibilityLabel={
                deviceData.relayState ? "Stop feeding" : "Start feeding"
              }
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
                    ? "Connect to the cloud server to control the dispenser."
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
