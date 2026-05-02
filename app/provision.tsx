import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useESP32 } from "@/hooks/useESP32Context";
import { claimDevice } from "@/services/api";

const ESP_AP_URL = "http://192.168.4.1";

type ProvisioningStep = "provisioning" | "claiming" | "done" | "error";
type ErrorKind = "webview" | "claim" | "no_device";

interface ProvisioningMessage {
  type: "device-info-found" | "provisioning-complete" | "error";
  chipId?: string;
  mqttPassword?: string;
  deviceName?: string;
  message?: string;
}

const injectedJavaScript = `
  (function() {
    function readInput(name) {
      var el = document.querySelector('input[name="' + name + '"], input#' + name);
      return el && el.value ? String(el.value).trim() : '';
    }

    function post(payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }

    function scan() {
      var body = document.body ? (document.body.innerText || '') : '';
      var chipId = readInput('deviceId') || (body.match(/Device ID\\s*[:\\-]?\\s*([A-Fa-f0-9]{6,8})/i) || [])[1] || '';
      var mqttPassword = readInput('mqttPassword') || (body.match(/MQTT Password\\s*[:\\-]?\\s*([A-Fa-f0-9]{8,32})/i) || [])[1] || '';
      var deviceName = readInput('deviceName') || 'Floyd Feeder';

      if (chipId) localStorage.setItem('floydChipId', chipId);
      if (mqttPassword) localStorage.setItem('floydMqttPassword', mqttPassword);
      if (deviceName) localStorage.setItem('floydDeviceName', deviceName);

      var storedChipId = localStorage.getItem('floydChipId') || chipId;
      var storedPassword = localStorage.getItem('floydMqttPassword') || mqttPassword;
      var storedName = localStorage.getItem('floydDeviceName') || deviceName;

      if (storedChipId && storedPassword) {
        post({
          type: 'device-info-found',
          chipId: storedChipId,
          mqttPassword: storedPassword,
          deviceName: storedName
        });
      }

      if (/success|saved|connected|restart|reboot/i.test(body) && storedChipId && storedPassword) {
        post({
          type: 'provisioning-complete',
          chipId: storedChipId,
          mqttPassword: storedPassword,
          deviceName: storedName
        });
      }
    }

    scan();
    setInterval(scan, 1000);
  })();
  true;
`;

export default function ProvisionScreen() {
  const [step, setStep] = useState<ProvisioningStep>("provisioning");
  const [errorKind, setErrorKind] = useState<ErrorKind>("webview");
  const [errorMsg, setErrorMsg] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [mqttPassword, setMqttPassword] = useState("");
  const { isConnected, chipId, setChipId, publishCommand } = useESP32();

  const finishClaim = useCallback(async (data: ProvisioningMessage) => {
    const cId = data.chipId || deviceId;
    const password = data.mqttPassword || mqttPassword;

    if (!cId || !password) {
      setStep("error");
      setErrorKind("claim");
      setErrorMsg("Provisioning completed, but the device ID or MQTT password was missing.");
      return;
    }

    setStep("claiming");
    const result = await claimDevice(cId, data.deviceName || "Floyd Feeder", password);

    if (!result.success) {
      setStep("error");
      setErrorKind("claim");
      setErrorMsg(result.error || "Failed to claim device on the server.");
      return;
    }

    await AsyncStorage.setItem("floydMqttPassword", password);
    setDeviceId(cId);
    setMqttPassword(password);
    setChipId(cId);
    setStep("done");
  }, [deviceId, mqttPassword, setChipId]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as ProvisioningMessage;

      if (data.type === "device-info-found") {
        if (data.chipId) setDeviceId(data.chipId);
        if (data.mqttPassword) setMqttPassword(data.mqttPassword);
        return;
      }

      if (data.type === "provisioning-complete") {
        finishClaim(data).catch((error) => {
          setStep("error");
          setErrorKind("claim");
          setErrorMsg(error instanceof Error ? error.message : "Failed to claim device.");
        });
        return;
      }

      if (data.type === "error") {
        setStep("error");
        setErrorKind("webview");
        setErrorMsg(data.message || "Provisioning failed.");
      }
    } catch {
      setStep("error");
      setErrorKind("webview");
      setErrorMsg("Failed to process provisioning data from the feeder.");
    }
  }, [finishClaim]);

  const handleWebViewError = useCallback(() => {
    setStep("error");
    setErrorKind("webview");
    setErrorMsg("Could not reach 192.168.4.1. Make sure your phone is connected to the FloydFeeder WiFi network.");
  }, []);

  const handleRestartProvisioning = useCallback(() => {
    publishCommand("restart_provisioning");
    setChipId(null);
    AsyncStorage.removeItem("floydChipId").catch(console.error);
    AsyncStorage.removeItem("floydMqttPassword").catch(console.error);
    setStep("provisioning");
    setErrorMsg("Restarting feeder in provisioning mode... Connect your phone to the FloydFeeder WiFi when it appears (may take ~10 seconds).");
  }, [publishCommand, setChipId]);

  const handleGoToDashboard = useCallback(() => {
    router.replace("/(tabs)");
  }, []);

  return (
    <View style={styles.container}>
      {step === "provisioning" && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>Set Up Floyd Feeder</Text>
            <Text style={styles.body}>
              Connect your phone to the FloydFeeder WiFi network, then use this portal to enter your home WiFi credentials.
            </Text>
            {!!deviceId && <Text style={styles.deviceId}>Device: {deviceId}</Text>}
          </View>
          <WebView
            source={{ uri: ESP_AP_URL }}
            injectedJavaScript={injectedJavaScript}
            onMessage={handleMessage}
            onError={handleWebViewError}
            javaScriptEnabled
            domStorageEnabled
            style={styles.webview}
          />
        </>
      )}

      {step === "claiming" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2e7d32" />
          <Text style={styles.title}>Claiming device...</Text>
          <Text style={styles.body}>Saving this feeder to the cloud server.</Text>
        </View>
      )}

      {step === "done" && (
        <View style={styles.centered}>
          <Text style={styles.title}>Device Connected</Text>
          <Text style={styles.body}>Device ID: {deviceId}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoToDashboard}>
            <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === "error" && (
        <View style={styles.centered}>
          <Text style={styles.title}>Setup Failed</Text>
          <Text style={styles.body}>{errorMsg}</Text>

          {errorKind === "webview" && isConnected && (
            <View style={styles.errorActions}>
              <Text style={styles.hint}>Your feeder is already online. To reconfigure it, factory reset below.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleGoToDashboard}>
                <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerButton} onPress={handleRestartProvisioning}>
                <Text style={styles.dangerButtonText}>Factory Reset & Re-provision</Text>
              </TouchableOpacity>
            </View>
          )}

          {errorKind === "webview" && !isConnected && chipId && (
            <View style={styles.errorActions}>
              <Text style={styles.hint}>This device is claimed but appears offline. You can restart it in provisioning mode.</Text>
              <TouchableOpacity style={styles.dangerButton} onPress={handleRestartProvisioning}>
                <Text style={styles.dangerButtonText}>Restart Provisioning Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleGoToDashboard}>
                <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}

          {errorKind === "webview" && !isConnected && !chipId && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep("provisioning")}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}

          {errorKind === "claim" && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => setStep("provisioning")}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}

          {errorKind === "no_device" && (
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setStep("provisioning")}>
                <Text style={styles.primaryButtonText}>Check WiFi Connection</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleGoToDashboard}>
                <Text style={styles.secondaryButtonText}>Back to Dashboard</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 16,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#555",
    textAlign: "center",
  },
  deviceId: {
    fontSize: 13,
    color: "#2e7d32",
    textAlign: "center",
    fontFamily: "monospace",
  },
  webview: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  errorActions: {
    gap: 12,
    alignItems: "center",
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    maxWidth: 280,
  },
  primaryButton: {
    backgroundColor: "#2e7d32",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#555",
    fontSize: 16,
    fontWeight: "600",
  },
  dangerButton: {
    backgroundColor: "#d32f2f",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
