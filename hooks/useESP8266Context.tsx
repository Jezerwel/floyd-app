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

interface ESP8266Data {
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
  esp8266Connected?: boolean;
  proxyConnected?: boolean;
}

interface FeedParams {
  augerSpeed: number;
  impellerSpeed: number;
  preSpinMs: number;
  feedMs: number;
  postSpinMs: number;
}

interface ESP8266ContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectionAttempts: number;
  deviceData: ESP8266Data;
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
  esp8266Status: "connected" | "disconnected" | "unknown";
  mqttBrokerUrl: string;
}

const ESP8266Context = createContext<ESP8266ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 10000;

interface ESP8266ProviderProps {
  children: ReactNode;
  initialChipId?: string | null;
}

export const ESP8266Provider: React.FC<ESP8266ProviderProps> = ({
  children,
  initialChipId = null,
}) => {
  const [chipId, setChipIdState] = useState<string | null>(initialChipId);
  const [deviceData, setDeviceData] = useState<ESP8266Data>({});
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
          motorState: (message.data.motorState as ESP8266Data["motorState"]) || prev.motorState || "idle",
          augerSpeed: (message.data.augerSpeed as number) ?? prev.augerSpeed,
          impellerSpeed: (message.data.impellerSpeed as number) ?? prev.impellerSpeed,
          lastUpdate: message.timestamp,
          proxyConnected: true,
          esp8266Connected: true,
        }));
        break;
      case "control_response":
        setDeviceData((prev) => ({
          ...prev,
          motorState: (message.data.motorState as ESP8266Data["motorState"]) ?? prev.motorState,
          lastUpdate: message.timestamp,
          esp8266Connected: true,
        }));
        break;
      case "status":
        setDeviceData((prev) => ({
          ...prev,
          feederConfig: (message.data.feederConfig as FeederConfig) ?? prev.feederConfig,
          wifiRssi: (message.data.wifiRssi as number) ?? prev.wifiRssi,
          lastUpdate: message.timestamp,
          proxyConnected: true,
          esp8266Connected: (message.data.connected as boolean) !== false,
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

  const esp8266Status: "connected" | "disconnected" | "unknown" =
    deviceData.esp8266Connected === true
      ? "connected"
      : deviceData.esp8266Connected === false
      ? "disconnected"
      : "unknown";

  const contextValue: ESP8266ContextType = useMemo(() => ({
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
    esp8266Status,
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
    esp8266Status,
    brokerUrl,
  ]);

  return (
    <ESP8266Context.Provider value={contextValue}>
      {children}
    </ESP8266Context.Provider>
  );
};

export const useESP8266 = (): ESP8266ContextType => {
  const context = useContext(ESP8266Context);
  if (!context) {
    throw new Error("useESP8266 must be used within an ESP8266Provider");
  }
  return context;
};

export default ESP8266Context;
