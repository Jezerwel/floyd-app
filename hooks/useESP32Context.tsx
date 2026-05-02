import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useMountEffect } from "./useMountEffect";
import useMQTT, { MQTTMessage } from "./useMQTT";

interface FeederConfig {
  cylinderRadius: number;
  cylinderHeight: number;
  frustumTopRadius: number;
  frustumBottomRadius: number;
  frustumHeight: number;
  totalVolumeCm3: number;
  defaultPreSpinMs: number;
  defaultPostSpinMs: number;
  defaultFeedMs: number;
}

interface ESP32Data {
  temperature?: number;
  temperatureSensorConnected?: boolean;
  ultrasonicSensorConnected?: boolean;
  distance?: number;
  foodLevelPercentage?: number;
  motorState?: "idle" | "pre_spin" | "feeding" | "post_spin" | "jam_clear";
  augerSpeed?: number;
  impellerSpeed?: number;
  wifiRssi?: number;
  feederConfig?: FeederConfig;
  lastUpdate?: number;
  esp32Connected?: boolean;
  proxyConnected?: boolean;
}

interface FeedParams {
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}

interface ESP32ContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectionAttempts: number;
  deviceData: ESP32Data;
  chipId: string | null;
  setChipId: (chipId: string | null) => void;
  connect: () => void;
  disconnect: () => void;
  resetConnection: () => void;
  publishCommand: (action: string, parameters?: object) => boolean;
  startFeed: (params: FeedParams) => void;
  stopFeed: () => void;
  clearJam: (speed?: number, duration?: number) => void;
  setSensorReadingInterval: (interval: number) => boolean;
  requestSensorData: () => boolean;
  isAutoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;
  esp32Status: "connected" | "disconnected" | "unknown";
  mqttBrokerUrl: string;
}

const ESP32Context = createContext<ESP32ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 10000;

interface ESP32ProviderProps {
  children: ReactNode;
  initialChipId?: string | null;
}

export const ESP32Provider: React.FC<ESP32ProviderProps> = ({
  children,
  initialChipId = null,
}) => {
  const [chipId, setChipIdState] = useState<string | null>(initialChipId);
  const [deviceData, setDeviceData] = useState<ESP32Data>({});
  const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(
    DEFAULT_AUTO_REFRESH_INTERVAL
  );

  const handleMessage = useCallback((message: MQTTMessage) => {
    switch (message.type) {
      case "sensor_data":
        setDeviceData((prev) => ({
          ...prev,
          temperature: (message.data.temperature as number) ?? prev.temperature,
          distance: (message.data.distance as number) ?? prev.distance,
          foodLevelPercentage: (message.data.foodLevelPercentage as number) ?? prev.foodLevelPercentage,
          temperatureSensorConnected: (message.data.temperatureSensorConnected as boolean) ?? prev.temperatureSensorConnected,
          ultrasonicSensorConnected: (message.data.ultrasonicSensorConnected as boolean) ?? prev.ultrasonicSensorConnected,
          motorState: (message.data.motorState as ESP32Data["motorState"]) || prev.motorState || "idle",
          augerSpeed: (message.data.augerSpeed as number) ?? prev.augerSpeed,
          impellerSpeed: (message.data.impellerSpeed as number) ?? prev.impellerSpeed,
          lastUpdate: message.timestamp,
          proxyConnected: true,
          esp32Connected: true,
        }));
        break;
      case "control_response":
        setDeviceData((prev) => ({
          ...prev,
          motorState: (message.data.motorState as ESP32Data["motorState"]) ?? prev.motorState,
          lastUpdate: message.timestamp,
          esp32Connected: true,
        }));
        break;
      case "status":
        setDeviceData((prev) => ({
          ...prev,
          feederConfig: (message.data.feederConfig as FeederConfig) ?? prev.feederConfig,
          wifiRssi: (message.data.wifiRssi as number) ?? prev.wifiRssi,
          lastUpdate: message.timestamp,
          proxyConnected: true,
          esp32Connected: (message.data.connected as boolean) !== false,
        }));
        break;
      case "error":
        console.error("MQTT device error:", message.data);
        break;
    }
  }, []);

  const {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    brokerUrl,
    connect: mqttConnect,
    disconnect: mqttDisconnect,
    publish,
    resetConnection,
  } = useMQTT(chipId, { onMessage: handleMessage });

  useMountEffect(() => {
    if (chipId) {
      mqttConnect(chipId);
    }

    return () => {
      mqttDisconnect();
    };
  });

  const setChipId = useCallback((nextChipId: string | null) => {
    setChipIdState(nextChipId);

    if (nextChipId) {
      AsyncStorage.setItem("floydChipId", nextChipId).catch(console.error);
      mqttConnect(nextChipId);
      return;
    }

    AsyncStorage.removeItem("floydChipId").catch(console.error);
    mqttDisconnect();
  }, [mqttConnect, mqttDisconnect]);

  const publishCommand = useCallback((action: string, parameters?: object): boolean => {
    return publish("command", {
      action,
      parameters,
      timestamp: Date.now(),
    });
  }, [publish]);

  const requestSensorData = useCallback((): boolean => {
    return publishCommand("get_sensors");
  }, [publishCommand]);

  const startFeed = useCallback((params: FeedParams) => {
    if (!isConnected) return;
    publishCommand("start_feed", params);
  }, [isConnected, publishCommand]);

  const stopFeed = useCallback(() => {
    if (!isConnected) return;
    publishCommand("stop_feed");
  }, [isConnected, publishCommand]);

  const clearJam = useCallback((speed?: number, duration?: number) => {
    if (!isConnected) return;
    publishCommand("clear_jam", { speed: speed || 768, duration: duration || 2000 });
  }, [isConnected, publishCommand]);

  const setSensorReadingInterval = useCallback((interval: number): boolean => {
    return publishCommand("set_sensor_interval", { interval });
  }, [publishCommand]);

  const connect = useCallback(() => {
    mqttConnect(chipId ?? undefined);
  }, [chipId, mqttConnect]);

  const disconnect = useCallback(() => {
    mqttDisconnect();
  }, [mqttDisconnect]);

  const esp32Status: "connected" | "disconnected" | "unknown" =
    deviceData.esp32Connected === true
      ? "connected"
      : deviceData.esp32Connected === false
      ? "disconnected"
      : "unknown";

  const contextValue: ESP32ContextType = useMemo(() => ({
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    deviceData,
    chipId,
    setChipId,
    connect,
    disconnect,
    resetConnection,
    publishCommand,
    startFeed,
    stopFeed,
    clearJam,
    setSensorReadingInterval,
    requestSensorData,
    isAutoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshInterval,
    setAutoRefreshInterval,
    esp32Status,
    mqttBrokerUrl: brokerUrl,
  }), [
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    deviceData,
    chipId,
    setChipId,
    connect,
    disconnect,
    resetConnection,
    publishCommand,
    startFeed,
    stopFeed,
    clearJam,
    setSensorReadingInterval,
    requestSensorData,
    isAutoRefreshEnabled,
    autoRefreshInterval,
    esp32Status,
    brokerUrl,
  ]);

  return (
    <ESP32Context.Provider value={contextValue}>
      {children}
    </ESP32Context.Provider>
  );
};

export const useESP32 = (): ESP32ContextType => {
  const context = useContext(ESP32Context);
  if (!context) {
    throw new Error("useESP32 must be used within an ESP32Provider");
  }
  return context;
};

export default ESP32Context;
