import { useCallback, useEffect, useRef, useState } from "react";

export interface ESP8266Message {
  type: "sensor_data" | "control_response" | "error" | "status";
  data: any;
  timestamp: number;
}

export interface ESP8266Command {
  action: string;
  parameters?: any;
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  lastMessage: ESP8266Message | null;
  connectionAttempts: number;
}

const useWebSocket = (url: string | null) => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null,
    connectionAttempts: 0,
  });

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    heartbeatTimeoutRef.current = setTimeout(() => {
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({ action: "ping" }));
        startHeartbeat(); // Schedule next heartbeat
      }
    }, 30000); // Send ping every 30 seconds
  }, []);

  const connect = useCallback(() => {
    if (!url) return;

    if (state.connectionAttempts >= maxReconnectAttempts) {
      setState((prev) => ({
        ...prev,
        error: "Maximum reconnection attempts reached",
        isConnecting: false,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isConnecting: true,
      error: null,
    }));

    try {
      cleanup();

      websocketRef.current = new WebSocket(url);

      websocketRef.current.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          connectionAttempts: 0,
        }));
        startHeartbeat();
      };

      websocketRef.current.onmessage = (event) => {
        try {
          const message: ESP8266Message = JSON.parse(event.data);
          setState((prev) => ({
            ...prev,
            lastMessage: message,
            error: null,
          }));
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
          setState((prev) => ({
            ...prev,
            error: "Failed to parse message from ESP8266",
          }));
        }
      };

      websocketRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setState((prev) => ({
          ...prev,
          error: "Connection error occurred",
          isConnected: false,
          isConnecting: false,
        }));
      };

      websocketRef.current.onclose = () => {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
        }));

        // Auto-reconnect if connection was established before
        if (state.connectionAttempts < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            setState((prev) => ({
              ...prev,
              connectionAttempts: prev.connectionAttempts + 1,
            }));
            connect();
          }, reconnectDelay);
        }
      };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to create WebSocket connection",
        isConnecting: false,
      }));
    }
  }, [url, state.connectionAttempts, cleanup, startHeartbeat]);

  const disconnect = useCallback(() => {
    cleanup();
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      lastMessage: null,
      connectionAttempts: 0,
    });
  }, [cleanup]);

  const sendCommand = useCallback((command: ESP8266Command): boolean => {
    if (
      !websocketRef.current ||
      websocketRef.current.readyState !== WebSocket.OPEN
    ) {
      setState((prev) => ({
        ...prev,
        error: "Not connected to ESP8266",
      }));
      return false;
    }

    try {
      const message = {
        ...command,
        timestamp: Date.now(),
      };
      websocketRef.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to send command",
      }));
      return false;
    }
  }, []);

  const resetConnection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      connectionAttempts: 0,
      error: null,
    }));
    if (url) {
      connect();
    }
  }, [url, connect]);

  useEffect(() => {
    if (url) {
      connect();
    }

    return cleanup;
  }, [url, connect, cleanup]);

  return {
    ...state,
    connect,
    disconnect,
    sendCommand,
    resetConnection,
  };
};

export default useWebSocket;
