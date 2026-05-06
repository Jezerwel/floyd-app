import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP32 } from "@/hooks/useESP32Context";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function StepperControl({
  value,
  onValueChange,
  color,
  disabled,
}: {
  value: number;
  onValueChange: (v: number) => void;
  color: string;
  disabled?: boolean;
}) {
  const STEP = 10;

  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const snap = (v: number) => Math.round(v / STEP) * STEP;

  const decrement = () => onValueChange(clamp(snap(value - STEP)));
  const increment = () => onValueChange(clamp(snap(value + STEP)));

  return (
    <View style={[styles.stepperRow, { opacity: disabled ? 0.5 : 1 }]}>
      <TouchableOpacity
        onPress={decrement}
        disabled={disabled}
        activeOpacity={0.6}
        style={[
          styles.stepperButton,
          { backgroundColor: color + "20", borderColor: color },
        ]}
      >
        <Text style={[styles.stepperButtonText, { color }]}>–</Text>
      </TouchableOpacity>

      <Text style={[styles.stepperValue, { color }]}>{value}%</Text>

      <TouchableOpacity
        onPress={increment}
        disabled={disabled}
        activeOpacity={0.6}
        style={[
          styles.stepperButton,
          { backgroundColor: color + "20", borderColor: color },
        ]}
      >
        <Text style={[styles.stepperButtonText, { color }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ControlsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const {
    isConnected,
    deviceData,
    esp32Status,
    startFeed,
    stopFeed,
    clearJam,
  } = useESP32();

  const [augerSpeed, setAugerSpeed] = useState(75);
  const [impellerSpeed, setImpellerSpeed] = useState(100);
  const [feedDuration, setFeedDuration] = useState(3);

  const isFeeding = deviceData.motorState !== "idle";

  const motorStateLabel: Record<string, string> = {
    pre_spin: "Getting ready...",
    feeding: "Feeding...",
    post_spin: "Finishing up...",
    jam_clear: "Unclogging...",
  };

  const handleFeed = () => {
    if (!isConnected) {
      Alert.alert("Offline", "Not connected to feeder.");
      return;
    }
    if (esp32Status !== "connected") {
      Alert.alert(
        "Feeder Not Available",
        "Feeder is offline — check power & WiFi."
      );
      return;
    }
    startFeed({
      augerSpeed: Math.round(augerSpeed * 10.23),
      impellerSpeed: Math.round(impellerSpeed * 10.23),
      preSpinMs: 1500,
      feedMs: Math.round(feedDuration * 1000),
      postSpinMs: 1500,
    });
  };

  const handleStop = () => {
    stopFeed();
  };

  const handleClearJam = () => {
    if (!isConnected) {
      Alert.alert("Offline", "Not connected to feeder.");
      return;
    }
    Alert.alert(
      "Clear Blockage",
      "Run the unclog sequence? The feed motor will reverse briefly.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Jam",
          style: "destructive",
          onPress: () => clearJam(),
        },
      ]
    );
  };

  const hardwareOffline = isConnected && esp32Status !== "connected";

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
        contentContainerStyle={styles.scrollContent}
      >
        {!isConnected && (
          <View
            style={[styles.banner, { backgroundColor: colors.error + "20" }]}
          >
            <IconSymbol name="wifi.slash" size={18} color={colors.error} />
            <Text style={[styles.bannerText, { color: colors.error }]}>
              Disconnected — controls unavailable
            </Text>
          </View>
        )}

        {hardwareOffline && (
          <View
            style={[styles.banner, { backgroundColor: colors.warning + "20" }]}
          >
            <IconSymbol
              name="exclamationmark.triangle.fill"
              size={18}
              color={colors.warning}
            />
            <Text style={[styles.bannerText, { color: colors.warning }]}>
              Feeder is offline — check power & WiFi
            </Text>
          </View>
        )}

        {isFeeding && deviceData.motorState && (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.primary + "20" },
            ]}
          >
            <IconSymbol
              name="arrow.triangle.2.circlepath"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.bannerText, { color: colors.primary }]}>
              {motorStateLabel[deviceData.motorState] ?? deviceData.motorState}
            </Text>
          </View>
        )}

        <StatCard title="Feed Speed" icon="gear" color={colors.primary}>
          <StepperControl
            value={augerSpeed}
            onValueChange={setAugerSpeed}
            color={colors.primary}
            disabled={!isConnected || isFeeding}
          />
        </StatCard>

        <StatCard title="Spread Speed" icon="fan" color={colors.secondary}>
          <StepperControl
            value={impellerSpeed}
            onValueChange={setImpellerSpeed}
            color={colors.secondary}
            disabled={!isConnected || isFeeding}
          />
        </StatCard>

        <StatCard
          title="Feed Duration"
          icon="timer"
          color={colors.primary}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.numberInput,
                {
                  color: colors.text,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              value={String(feedDuration)}
              onChangeText={(t) => {
                const n = Number(t);
                if (!isNaN(n) && n >= 0 && n <= 30) setFeedDuration(n);
              }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              maxLength={4}
            />
            <Text style={[styles.inputUnit, { color: colors.muted }]}>
              seconds (max 30)
            </Text>
          </View>
        </StatCard>



        <TouchableOpacity
          style={[
            styles.feedButton,
            { backgroundColor: colors.success, opacity: isFeeding ? 0.5 : 1 },
          ]}
          onPress={handleFeed}
          disabled={isFeeding}
          activeOpacity={0.8}
        >
          <IconSymbol name="play.fill" size={24} color="white" />
          <Text style={styles.feedButtonText}>FEED</Text>
        </TouchableOpacity>

        {isFeeding && (
          <TouchableOpacity
            style={[styles.stopButton, { backgroundColor: colors.error }]}
            onPress={handleStop}
            activeOpacity={0.8}
          >
            <IconSymbol name="stop.fill" size={24} color="white" />
            <Text style={styles.feedButtonText}>STOP</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.jamButton, { backgroundColor: colors.warning }]}
          onPress={handleClearJam}
          activeOpacity={0.8}
        >
          <IconSymbol
            name="arrow.trianglehead.2.counterclockwise"
            size={24}
            color="white"
          />
          <Text style={styles.feedButtonText}>CLEAR JAM</Text>
        </TouchableOpacity>
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 4,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: -2,
  },
  stepperValue: {
    fontSize: 28,
    fontWeight: "bold",
    minWidth: 72,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  numberInput: {
    fontSize: 20,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 90,
    textAlign: "center",
  },
  inputUnit: {
    fontSize: 14,
  },
  feedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 20,
    borderRadius: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 20,
    borderRadius: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  jamButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  feedButtonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
