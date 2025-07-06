import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
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
  const { toggleRelay, isConnected } = useESP8266();

  // Paddle on/off states
  const [leftPaddleOn, setLeftPaddleOn] = useState(false);
  const [rightPaddleOn, setRightPaddleOn] = useState(false);

  const handleLeftPaddleToggle = () => {
    setLeftPaddleOn(!leftPaddleOn);
    // TODO: Send paddle control command to ESP8266
  };

  const handleRightPaddleToggle = () => {
    setRightPaddleOn(!rightPaddleOn);
    // TODO: Send paddle control command to ESP8266
  };

  const handleDispenseNow = () => {
    if (!isConnected) {
      Alert.alert(
        "Error",
        "Not connected to feeder device. Please check your connection."
      );
      return;
    }

    Alert.alert(
      "Dispense Food",
      "This will activate the feeder relay to dispense food. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dispense",
          style: "default",
          onPress: () => {
            const success = toggleRelay();
            if (success) {
              Alert.alert("Success", "Food dispenser activated!");
            } else {
              Alert.alert(
                "Error",
                "Failed to activate dispenser. Please try again."
              );
            }
          },
        },
      ]
    );
  };

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
          Paddle Controls
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Paddle Toggle Controls */}
        <StatCard
          title="Paddle Controls"
          icon="gear.badge"
          color={colors.primary}
        >
          <View style={styles.paddleContainer}>
            {/* Left Paddle Toggle */}
            <TouchableOpacity
              style={[
                styles.paddleToggle,
                {
                  backgroundColor: leftPaddleOn ? colors.primary : colors.card,
                  borderColor: leftPaddleOn ? colors.primary : colors.border,
                },
              ]}
              onPress={handleLeftPaddleToggle}
            >
              {/* <IconSymbol
                name="arrow.clockwise"
                size={32}
                color={leftPaddleOn ? "white" : colors.muted}
              /> */}
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
                },
              ]}
              onPress={handleRightPaddleToggle}
            >
              {/* <IconSymbol
                name="arrow.counterclockwise"
                size={32}
                color={rightPaddleOn ? "white" : colors.muted}
              /> */}
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
        </StatCard>

        {/* Manual Feed */}
        <StatCard
          title="Feed Dispenser"
          icon="hand.point.up.left"
          color={colors.secondary}
        >
          <View style={styles.manualFeedContent}>
            <TouchableOpacity
              style={[
                styles.dispenseButton,
                {
                  backgroundColor: isConnected ? colors.accent : colors.muted,
                  opacity: isConnected ? 1 : 0.6,
                },
              ]}
              onPress={handleDispenseNow}
              disabled={!isConnected}
            >
              <IconSymbol name="drop.fill" size={24} color="white" />
              <Text style={styles.dispenseButtonText}>
                {isConnected ? "Dispense Now" : "Not Connected"}
              </Text>
            </TouchableOpacity>
            {!isConnected && (
              <Text style={[styles.connectionWarning, { color: colors.muted }]}>
                Connect to your feeder device to enable dispensing
              </Text>
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
});
