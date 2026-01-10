import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import useWebSocket, { ConnectionQuality } from "./useWebSocket";

interface FeederConfig {
  height: number;
  minDistance: number;
  maxDistance: number;
}

interface ESP8266Data {
  temperature?: number;
  sensorConnected?: boolean;
  temperatureSensorConnected?: boolean;
  ultrasonicSensorConnected?: boolean;
  distance?: number;
  foodLevelPercentage?: number;
  relayState?: boolean;
  motorOpened?: boolean;
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
  toggleRelay: () => boolean;
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

  useEffect(() => {
    if (isConnected && isAutoRefreshEnabled && autoRefreshInterval > 0) {
      const actualInterval = autoRefreshInterval * 2;
      const interval = setInterval(() => {
        const timeSinceLastUpdate = deviceData.lastUpdate
          ? Date.now() - deviceData.lastUpdate
          : Infinity;
        if (timeSinceLastUpdate > actualInterval * 1.5) {
          requestSensorData();
        }
      }, actualInterval);
      return () => clearInterval(interval);
    }
  }, [
    isConnected,
    isAutoRefreshEnabled,
    autoRefreshInterval,
    requestSensorData,
    deviceData.lastUpdate,
  ]);

  useEffect(() => {
    if (!lastMessage) return;
    switch (lastMessage.type) {
      case "sensor_data":
        setDeviceData((prev) => ({
          ...prev,
          ...lastMessage.data,
          lastUpdate: lastMessage.timestamp,
          proxyConnected: true,
          esp8266Connected: lastMessage.data.esp8266Connected !== false,
        }));
        break;
      case "control_response":
        setDeviceData((prev) => ({
          ...prev,
          ...lastMessage.data,
          lastUpdate: lastMessage.timestamp,
        }));
        break;
      case "status":
        setDeviceData((prev) => ({
          ...prev,
          ...lastMessage.data,
          lastUpdate: lastMessage.timestamp,
          proxyConnected: true,
          esp8266Connected: lastMessage.data.esp8266Connected !== false,
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

  const toggleRelay = (): boolean => {
    const previousState = deviceData.relayState;
    setDeviceData((prev) => ({
      ...prev,
      relayState: !prev.relayState,
    }));
    const success = sendCommand({
      action: "toggle_relay",
    });
    if (!success) {
      setDeviceData((prev) => ({
        ...prev,
        relayState: previousState,
      }));
    }
    return success;
  };

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

  const contextValue: ESP8266ContextType = {
    isConnected,
    isConnecting,
    error,
    connectionAttempts,
    deviceData,
    connect,
    disconnect,
    resetConnection,
    toggleRelay,
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
