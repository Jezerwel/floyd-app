import ESP8266Connection from "@/components/ESP8266Connection";
import ESP8266Controls from "@/components/ESP8266Controls";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TemperatureScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <IconSymbol name="thermometer" size={24} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Temperature Monitor
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ESP8266 Connection */}
        <View style={styles.section}>
          <ESP8266Connection />
        </View>

        {/* ESP8266 Controls */}
        <View style={styles.section}>
          <ESP8266Controls />
        </View>

        {/* Info Section */}
        <View
          style={[
            styles.infoSection,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            DS18B20 Temperature Sensor
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            This app uses WebSocket protocol for real-time communication with
            your ESP8266 device equipped with a waterproof DS18B20 temperature
            sensor.
          </Text>

          <Text style={[styles.infoSubTitle, { color: colors.text }]}>
            Features:
          </Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>
            • Waterproof Temperature Monitoring{"\n"}• LED & Relay Control{"\n"}
            • Real-time Data Updates{"\n"}• Automatic Reconnection{"\n"}•
            Connection Status Indicators{"\n"}• Customizable Refresh Intervals
          </Text>
        </View>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  infoSection: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  infoSubTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
