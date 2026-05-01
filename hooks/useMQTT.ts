import { useCallback, useRef, useState } from "react";
import mqtt, { MqttClient } from "mqtt";

type GlobalWithProcess = typeof globalThis & {
  process?: {
    nextTick?: (callback: () => void) => void;
  };
};

const globalScope = globalThis as GlobalWithProcess;
globalScope.process = globalScope.process ?? {};
globalScope.process.nextTick = globalScope.process.nextTick ?? ((callback) => setTimeout(callback, 0));

const DEFAULT_BROKER_URL = "mqtts://broker.hivemq.com:8883";
const BROKER_URL = process.env.EXPO_PUBLIC_MQTT_BROKER_URL || DEFAULT_BROKER_URL;

export interface MQTTMessage {
  type: "sensor_data" | "control_response" | "error" | "status";
  data: Record<string, unknown>;
  timestamp: number;
}

interface MQTTState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessage: MQTTMessage | null;
  connectionAttempts: number;
}

interface UseMQTTOptions {
  onMessage?: (message: MQTTMessage) => void;
}

const useMQTT = (deviceChipId: string | null, options: UseMQTTOptions = {}) => {
  const [state, setState] = useState<MQTTState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null,
    connectionAttempts: 0,
  });

  const clientRef = useRef<MqttClient | null>(null);
  const chipIdRef = useRef(deviceChipId);
  const onMessageRef = useRef(options.onMessage);
  chipIdRef.current = deviceChipId;
  onMessageRef.current = options.onMessage;

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null,
    }));
  }, []);

  const connect = useCallback((nextChipId?: string) => {
    const chipId = nextChipId ?? chipIdRef.current;

    if (!chipId) {
      setState((prev) => ({
        ...prev,
        error: "No device has been provisioned yet",
        isConnecting: false,
      }));
      return;
    }

    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }

    chipIdRef.current = chipId;
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    const client = mqtt.connect(BROKER_URL, {
      clientId: `floyd-app-${Date.now().toString(36)}`,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: 20000,
      reschedulePings: true,
      resubscribe: true,
      timerVariant: "native",
      rejectUnauthorized: false,
    });

    client.on("connect", () => {
      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null,
        connectionAttempts: 0,
      }));

      client.subscribe(`floyd/devices/${chipId}/telemetry`, { qos: 0 });
      client.subscribe(`floyd/devices/${chipId}/status`, { qos: 0 });
      client.subscribe(`floyd/devices/${chipId}/response`, { qos: 0 });
    });

    client.on("reconnect", () => {
      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: true,
        connectionAttempts: prev.connectionAttempts + 1,
      }));
    });

    client.on("message", (_topic, payload) => {
      try {
        const parsed = JSON.parse(payload.toString()) as MQTTMessage;
        setState((prev) => ({ ...prev, lastMessage: parsed, error: null }));
        onMessageRef.current?.(parsed);
      } catch (error) {
        console.error("Failed to parse MQTT message:", error);
      }
    });

    client.on("error", (error) => {
      setState((prev) => ({
        ...prev,
        error: error.message,
        isConnecting: false,
      }));
    });

    client.on("offline", () => {
      setState((prev) => ({ ...prev, isConnected: false }));
    });

    client.on("close", () => {
      setState((prev) => ({ ...prev, isConnected: false, isConnecting: false }));
    });

    clientRef.current = client;
  }, []);

  const publish = useCallback((topic: "command" | "config", payload: object): boolean => {
    const chipId = chipIdRef.current;

    if (!clientRef.current?.connected || !chipId) {
      setState((prev) => ({ ...prev, error: "MQTT is not connected" }));
      return false;
    }

    const fullTopic = `floyd/devices/${chipId}/${topic}`;
    clientRef.current.publish(fullTopic, JSON.stringify(payload), { qos: 0 });
    return true;
  }, []);

  const resetConnection = useCallback(() => {
    const chipId = chipIdRef.current;
    disconnect();
    if (chipId) {
      setTimeout(() => connect(chipId), 500);
    }
  }, [connect, disconnect]);

  return {
    ...state,
    brokerUrl: BROKER_URL,
    connect,
    disconnect,
    publish,
    resetConnection,
  };
};

export default useMQTT;
