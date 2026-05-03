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

const ESP_AP_URL = "http://192.168.4.1";

type ProvisioningStep = "provisioning" | "done" | "error";
type ErrorKind = "webview" | "no_device";

interface ProvisioningMessage {
  type: "device-info-found" | "provisioning-complete" | "error";
  chipId?: string;
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
      var deviceName = readInput('deviceName') || 'Floyd Feeder';

      if (chipId) localStorage.setItem('floydChipId', chipId);
      if (deviceName) localStorage.setItem('floydDeviceName', deviceName);

      var storedChipId = localStorage.getItem('floydChipId') || chipId;
      var storedName = localStorage.getItem('floydDeviceName') || deviceName;

      if (storedChipId) {
        post({
          type: 'device-info-found',
          chipId: storedChipId,
          deviceName: storedName
        });
      }

      if (/success|saved|connected|restart|reboot/i.test(body) && storedChipId) {
        post({
          type: 'provisioning-complete',
          chipId: storedChipId,
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
  const { isConnected, chipId, setChipId, publishCommand } = useESP32();

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as ProvisioningMessage;

      if (data.type === "device-info-found") {
        if (data.chipId) setDeviceId(data.chipId);
        return;
      }

      if (data.type === "provisioning-complete") {
        const cId = data.chipId || deviceId;
        if (cId) {
          AsyncStorage.setItem("floydChipId", cId).catch(console.error);
          setChipId(cId);
          setDeviceId(cId);
          setStep("done");
        } else {
          setStep("error");
          setErrorKind("webview");
          setErrorMsg("Provisioning completed, but could not read the device ID.");
        }
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
  }, [deviceId, setChipId]);

  const handleWebViewError = useCallback(() => {
    setStep("error");
    setErrorKind("webview");
    setErrorMsg("Could not reach 192.168.4.1. Make sure your phone is connected to the FloydFeeder WiFi network.");
  }, []);

  const handleRestartProvisioning = useCallback(() => {
    publishCommand("restart_provisioning");
    setChipId(null);
    AsyncStorage.removeItem("floydChipId").catch(console.error);
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

      {step === "done" && (
        <View style={styles.centered}>
          <Text style={styles.title}>Device Connected</Text>
          <Text style={styles.body}>Device ID: {deviceId}</Text>
          <Text style={styles.body}>The feeder is now on your WiFi network. The app will discover it automatically.</Text>
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
