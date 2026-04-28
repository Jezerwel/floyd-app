import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import useWebSocket, { ConnectionQuality } from "./useWebSocket";

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
  motorState?: 'idle' | 'pre_spin' | 'feeding' | 'post_spin' | 'jam_clear';
  augerSpeed?: number;
  impellerSpeed?: number;
  wifiRssi?: number;
  feederConfig?: FeederConfig;
  lastUpdate?: number;
  esp8266Connected?: boolean;
  proxyConnected?: boolean;
}

interface ESP8266ContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectionAttempts: number;
  deviceData: ESP8266Data;
  connect: () => void;
  disconnect: () => void;
  resetConnection: () => void;
  startFeed: (params: {
    augerSpeed: number;
    impellerSpeed: number;
    preSpinMs: number;
    feedMs: number;
    postSpinMs: number;
  }) => void;
  stopFeed: () => void;
  clearJam: (speed?: number, duration?: number) => void;
  setSensorReadingInterval: (interval: number) => boolean;
  requestSensorData: () => boolean;
  isAutoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;
  esp8266Status: "connected" | "disconnected" | "unknown";
  connectionQuality: ConnectionQuality;
  latency: number | null;
  cloudServerUrl: string;
}

const ESP8266Context = createContext<ESP8266ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 10000;
const CLOUD_SERVER_URL = "wss://floyd-feeder.up.railway.app";

interface ESP8266ProviderProps {
  children: ReactNode;
}

export const ESP8266Provider: React.FC<ESP8266ProviderProps> = ({
  children,
}) => {
  const [deviceData, setDeviceData] = useState<ESP8266Data>({});
  const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(
    DEFAULT_AUTO_REFRESH_INTERVAL
  );

  const {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    lastMessage,
    connect: wsConnect,
    disconnect: wsDisconnect,
    sendCommand,
    resetConnection: wsResetConnection,
    connectionQuality,
    latency,
  } = useWebSocket(CLOUD_SERVER_URL);

  const requestSensorData = useCallback((): boolean => {
    return sendCommand({
      action: "get_sensors",
    });
  }, [sendCommand]);

  const startFeed = useCallback((params: {
    augerSpeed: number;
    impellerSpeed: number;
    preSpinMs: number;
    feedMs: number;
    postSpinMs: number;
  }) => {
    if (!isConnected) return;
    sendCommand({
      action: "start_feed",
      parameters: {
        augerSpeed: params.augerSpeed,
        impellerSpeed: params.impellerSpeed,
        preSpinMs: params.preSpinMs,
        feedMs: params.feedMs,
        postSpinMs: params.postSpinMs,
      },
    });
  }, [isConnected, sendCommand]);

  const stopFeed = useCallback(() => {
    if (!isConnected) return;
    sendCommand({ action: "stop_feed" });
  }, [isConnected, sendCommand]);

  const clearJam = useCallback((speed?: number, duration?: number) => {
    if (!isConnected) return;
    sendCommand({
      action: "clear_jam",
      parameters: { speed: speed || 768, duration: duration || 2000 },
    });
  }, [isConnected, sendCommand]);

  const setSensorReadingInterval = (interval: number): boolean => {
    return sendCommand({
      action: "set_sensor_interval",
      parameters: { interval },
    });
  };

  const connect = () => {
    wsConnect();
  };

  const disconnect = () => {
    wsDisconnect();
  };

  const resetConnection = () => {
    wsResetConnection();
  };

  const esp8266Status: "connected" | "disconnected" | "unknown" =
    deviceData.esp8266Connected === true
      ? "connected"
      : deviceData.esp8266Connected === false
      ? "disconnected"
      : "unknown";

  // Process lastMessage via useMemo instead of useEffect for derived state
  useMemo(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case "sensor_data":
        setDeviceData((prev) => ({
          ...prev,
          temperature: (lastMessage.data.temperature as number) ?? prev.temperature,
          distance: (lastMessage.data.distance as number) ?? prev.distance,
          foodLevelPercentage: (lastMessage.data.foodLevelPercentage as number) ?? prev.foodLevelPercentage,
          temperatureSensorConnected: (lastMessage.data.temperatureSensorConnected as boolean) ?? prev.temperatureSensorConnected,
          ultrasonicSensorConnected: (lastMessage.data.ultrasonicSensorConnected as boolean) ?? prev.ultrasonicSensorConnected,
          motorState: (lastMessage.data.motorState as ESP8266Data['motorState']) || 'idle',
          augerSpeed: (lastMessage.data.augerSpeed as number) ?? prev.augerSpeed,
          impellerSpeed: (lastMessage.data.impellerSpeed as number) ?? prev.impellerSpeed,
          lastUpdate: lastMessage.timestamp,
          proxyConnected: true,
          esp8266Connected: (lastMessage.data.esp8266Connected as boolean) !== false,
        }));
        break;
      case "control_response":
        setDeviceData((prev) => ({
          ...prev,
          motorState: (lastMessage.data.motorState as ESP8266Data['motorState']) ?? prev.motorState,
          lastUpdate: lastMessage.timestamp,
        }));
        break;
      case "status":
        setDeviceData((prev) => ({
          ...prev,
          feederConfig: (lastMessage.data.feederConfig as FeederConfig) ?? prev.feederConfig,
          wifiRssi: (lastMessage.data.wifiRssi as number) ?? prev.wifiRssi,
          lastUpdate: lastMessage.timestamp,
          proxyConnected: true,
          esp8266Connected: (lastMessage.data.esp8266Connected as boolean) !== false,
        }));
        break;
      case "error":
        console.error("Cloud Server Error:", lastMessage.data);
        const errorMessage = lastMessage.data?.message;
        if (
          typeof errorMessage === "string" &&
          errorMessage.includes("ESP8266")
        ) {
          setDeviceData((prev) => ({
            ...prev,
            esp8266Connected: false,
          }));
        }
        break;
    }
  }, [lastMessage]);

  const contextValue: ESP8266ContextType = {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    deviceData,
    connect,
    disconnect,
    resetConnection,
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
    connectionQuality,
    latency,
    cloudServerUrl: CLOUD_SERVER_URL,
  };

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
