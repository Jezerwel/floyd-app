import { IconSymbol } from "@/components/ui/IconSymbol";
import { StatCard } from "@/components/ui/StatCard";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useESP8266 } from "@/hooks/useESP8266Context";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import {
  Alert,
  GestureResponderEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function PctSlider({
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
  const [barWidth, setBarWidth] = useState(0);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (disabled) return;
      const x = e.nativeEvent.locationX;
      const pct = Math.round(Math.max(0, Math.min(100, (x / barWidth) * 100)));
      onValueChange(pct);
    },
    [barWidth, disabled, onValueChange]
  );

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      style={[
        styles.sliderTrack,
        {
          backgroundColor: color + "20",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      disabled={disabled}
    >
      <View
        style={[
          styles.sliderFill,
          {
            backgroundColor: color,
            width: `${value}%` as any,
          },
        ]}
      />
      <View
        style={[
          styles.sliderThumb,
          {
            backgroundColor: color,
            left: `${value}%` as any,
            marginLeft: -12,
          },
        ]}
      />
    </TouchableOpacity>
  );
}

export default function ControlsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const {
    isConnected,
    deviceData,
    esp8266Status,
    startFeed,
    stopFeed,
    clearJam,
  } = useESP8266();

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
      Alert.alert("Offline", "Not connected to cloud server.");
      return;
    }
    if (esp8266Status !== "connected") {
      Alert.alert(
        "Feeder Not Available",
        "Connected to cloud, but the feeder is offline."
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
      Alert.alert("Offline", "Not connected to cloud server.");
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

  const hardwareOffline = isConnected && esp8266Status !== "connected";

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
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: colors.text }]}>
              {augerSpeed}%
            </Text>
          </View>
          <PctSlider
            value={augerSpeed}
            onValueChange={setAugerSpeed}
            color={colors.primary}
          />
        </StatCard>

        <StatCard title="Spread Speed" icon="fan" color={colors.secondary}>
          <View style={styles.sliderRow}>
            <Text style={[styles.sliderLabel, { color: colors.text }]}>
              {impellerSpeed}%
            </Text>
          </View>
          <PctSlider
            value={impellerSpeed}
            onValueChange={setImpellerSpeed}
            color={colors.secondary}
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
  sliderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 12,
  },
  sliderLabel: {
    fontSize: 28,
    fontWeight: "bold",
  },
  sliderRaw: {
    fontSize: 13,
  },
  sliderTrack: {
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    overflow: "hidden",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  sliderThumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
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
