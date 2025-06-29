import React, {
  createContext,
  ReactNode,
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

  // Configuration
  deviceUrl: string | null;
  savedDevices: SavedDevice[];
  addSavedDevice: (device: SavedDevice) => void;
  removeSavedDevice: (id: string) => void;
}

interface SavedDevice {
  id: string;
  name: string;
  url: string;
  lastConnected?: number;
}

const ESP8266Context = createContext<ESP8266ContextType | null>(null);

interface ESP8266ProviderProps {
  children: ReactNode;
}

export const ESP8266Provider: React.FC<ESP8266ProviderProps> = ({
  children,
}) => {
  const [deviceUrl, setDeviceUrlState] = useState<string | null>(null);
  const [deviceData, setDeviceData] = useState<ESP8266Data>({});
  const [savedDevices, setSavedDevices] = useState<SavedDevice[]>([]);

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

  const requestSensorData = (): boolean => {
    return sendCommand({
      action: "get_sensors",
    });
  };

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
