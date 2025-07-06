import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
  ledState?: boolean;
  relayState?: boolean;
  feederConfig?: FeederConfig;
  lastUpdate?: number;
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
  toggleLED: () => boolean;
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
}

export interface SavedDevice {
  id: string;
  name: string;
  url: string;
  lastConnected?: number;
}

const ESP8266Context = createContext<ESP8266ContextType | null>(null);

const DEFAULT_AUTO_REFRESH_INTERVAL = 5000; // 5 seconds

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

  // Add ref to track last LED command to prevent infinite loops
  const lastLedCommandRef = useRef<number>(0);
  const LED_COMMAND_DEBOUNCE_MS = 2000; // 2 seconds debounce

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

  // Auto-refresh sensor data
  useEffect(() => {
    if (isConnected && isAutoRefreshEnabled && autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        requestSensorData();
      }, autoRefreshInterval);

      return () => clearInterval(interval);
    }
  }, [
    isConnected,
    isAutoRefreshEnabled,
    autoRefreshInterval,
    requestSensorData,
  ]);

  // Handle incoming messages from ESP8266
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case "sensor_data":
        setDeviceData((prev) => ({
          ...prev,
          ...lastMessage.data,
          lastUpdate: lastMessage.timestamp,
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
        }));
        break;

      case "error":
        console.error("ESP8266 Error:", lastMessage.data);
        break;
    }
  }, [lastMessage]);

  // Device control functions
  const toggleLED = (): boolean => {
    return sendCommand({
      action: "toggle_led",
    });
  };

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

  // Auto LED control based on connection status
  useEffect(() => {
    const now = Date.now();

    // Debounce LED commands to prevent infinite loops
    if (now - lastLedCommandRef.current < LED_COMMAND_DEBOUNCE_MS) {
      return;
    }

    if (isConnected && deviceData.ledState === false) {
      // Turn LED ON when connected (if not already on)
      console.log("Auto-turning LED ON (connected)");
      sendCommand({ action: "toggle_led" });
      lastLedCommandRef.current = now;
    } else if (!isConnected && deviceData.ledState === true) {
      // Turn LED OFF when disconnected (if not already off)
      console.log("Auto-turning LED OFF (disconnected)");
      sendCommand({ action: "toggle_led" });
      lastLedCommandRef.current = now;
    }
  }, [isConnected, deviceData.ledState, sendCommand]);

  // Connection management
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

  // Saved devices management
  const addSavedDevice = (device: SavedDevice) => {
    setSavedDevices((prev) => {
      const filtered = prev.filter((d) => d.id !== device.id);
      return [...filtered, { ...device, lastConnected: Date.now() }];
    });
  };

  const removeSavedDevice = (id: string) => {
    setSavedDevices((prev) => prev.filter((d) => d.id !== id));
  };

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
    toggleLED,
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
    throw new Error("useESP8266 must be used within ESP8266Provider");
  }
  return context;
};

export default ESP8266Context;
