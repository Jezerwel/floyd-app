import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import useWebSocket from "./useWebSocket";

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
  // Add proxy server status
  esp8266Connected?: boolean;
  proxyConnected?: boolean;
}

interface ESP8266ContextType {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connectionAttempts: number;

  // Device data
  deviceData: ESP8266Data;

  // Connection management
  connect: () => void;
  disconnect: () => void;
  resetConnection: () => void;
  setDeviceUrl: (url: string) => void;

  // Device controls
  toggleRelay: () => boolean;
  setSensorReadingInterval: (interval: number) => boolean;
  requestSensorData: () => boolean;

  // Auto-refresh controls
  isAutoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  autoRefreshInterval: number;
  setAutoRefreshInterval: (interval: number) => void;

  // Configuration
  deviceUrl: string | null;
  savedDevices: SavedDevice[];
  addSavedDevice: (device: SavedDevice) => void;
  removeSavedDevice: (id: string) => void;

  // Proxy server status
  isProxyConnection: boolean;
  esp8266Status: "connected" | "disconnected" | "unknown";
}

export interface SavedDevice {
  id: string;
  name: string;
  url: string;
  lastConnected?: number;
}

const ESP8266Context = createContext<ESP8266ContextType | null>(null);

// Increase default interval for proxy connections (server handles auto-updates)
const DEFAULT_AUTO_REFRESH_INTERVAL = 10000; // 10 seconds for proxy, reduced load

interface ESP8266ProviderProps {
  children: ReactNode;
}

export const ESP8266Provider: React.FC<ESP8266ProviderProps> = ({
  children,
}) => {
  const [deviceUrl, setDeviceUrlState] = useState<string | null>(null);
  const [deviceData, setDeviceData] = useState<ESP8266Data>({});
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);
  const [isAutoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(
    DEFAULT_AUTO_REFRESH_INTERVAL
  );

  // Track if this is a proxy connection
  const isProxyConnection =
    deviceUrl?.includes("localhost") ||
    deviceUrl?.includes("127.0.0.1") ||
    deviceUrl?.includes("10.0.2.2") ||
    false;

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
  } = useWebSocket(deviceUrl);

  // Device control functions (moved up to avoid dependency issues)
  const requestSensorData = useCallback((): boolean => {
    return sendCommand({
      action: "get_sensors",
    });
  }, [sendCommand]);

  // Smart auto-refresh: less aggressive for proxy connections
  useEffect(() => {
    if (isConnected && isAutoRefreshEnabled && autoRefreshInterval > 0) {
      // For proxy connections, rely more on server pushes and reduce polling
      const actualInterval = isProxyConnection
        ? autoRefreshInterval * 2
        : autoRefreshInterval;

      const interval = setInterval(() => {
        // Only request if we haven't received data recently
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
    isProxyConnection,
    deviceData.lastUpdate,
  ]);

  // Handle incoming messages from ESP8266/Proxy
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "sensor_data":
        setDeviceData((prev) => ({
          ...prev,
          ...lastMessage.data,
          lastUpdate: lastMessage.timestamp,
          proxyConnected: isProxyConnection,
          esp8266Connected: isProxyConnection
            ? lastMessage.data.esp8266Connected !== false
            : true,
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
          proxyConnected: isProxyConnection,
          esp8266Connected: isProxyConnection
            ? lastMessage.data.esp8266Connected !== false
            : true,
        }));
        break;

      case "error":
        console.error("ESP8266/Proxy Error:", lastMessage.data);
        // Update ESP8266 status if proxy reports ESP8266 issues
        if (
          isProxyConnection &&
          lastMessage.data?.message?.includes("ESP8266")
        ) {
          setDeviceData((prev) => ({
            ...prev,
            esp8266Connected: false,
          }));
        }
        break;
    }
  }, [lastMessage, isProxyConnection]);

  // Device control functions
  const toggleRelay = (): boolean => {
    return sendCommand({
      action: "toggle_relay",
    });
  };

  const setSensorReadingInterval = (interval: number): boolean => {
    return sendCommand({
      action: "set_sensor_interval",
      parameters: { interval },
    });
  };

  // Connection management functions
  const setDeviceUrl = (url: string) => {
    setDeviceUrlState(url);
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

  // Saved devices management (with localStorage persistence)
  const addSavedDevice = (device: SavedDevice) => {
    const updatedDevice = { ...device, lastConnected: Date.now() };
    setSavedDevices((prev) => {
      const newDevices = [
        ...prev.filter((d) => d.id !== device.id),
        updatedDevice,
      ];
      try {
        localStorage.setItem("savedDevices", JSON.stringify(newDevices));
      } catch (error) {
        console.warn("Failed to save device to localStorage:", error);
      }
      return newDevices;
    });
  };

  const removeSavedDevice = (id: string) => {
    setSavedDevices((prev) => {
      const newDevices = prev.filter((device) => device.id !== id);
      try {
        localStorage.setItem("savedDevices", JSON.stringify(newDevices));
      } catch (error) {
        console.warn("Failed to remove device from localStorage:", error);
      }
      return newDevices;
    });
  };

  // Load saved devices on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("savedDevices");
      if (saved) {
        setSavedDevices(JSON.parse(saved));
      }
    } catch (error) {
      console.warn("Failed to load saved devices from localStorage:", error);
    }
  }, []);

  // Determine ESP8266 connection status
  const esp8266Status: "connected" | "disconnected" | "unknown" =
    isProxyConnection
      ? deviceData.esp8266Connected === true
        ? "connected"
        : deviceData.esp8266Connected === false
        ? "disconnected"
        : "unknown"
      : isConnected
      ? "connected"
      : "disconnected";

  const contextValue: ESP8266ContextType = {
    // Connection state
    isConnected,
    isConnecting,
    error,
    connectionAttempts,

    // Device data
    deviceData,

    // Connection management
    connect,
    disconnect,
    resetConnection,
    setDeviceUrl,

    // Device controls
    toggleRelay,
    setSensorReadingInterval,
    requestSensorData,

    // Auto-refresh controls
    isAutoRefreshEnabled,
    setAutoRefreshEnabled,
    autoRefreshInterval,
    setAutoRefreshInterval,

    // Configuration
    deviceUrl,
    savedDevices,
    addSavedDevice,
    removeSavedDevice,

    // Proxy server status
    isProxyConnection,
    esp8266Status,
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
