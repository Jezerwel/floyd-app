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

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;
const CONNECTION_TIMEOUT = 10000; // 10 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

const useWebSocket = (url: string | null) => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null,
    connectionAttempts: 0,
  });

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const heartbeatTimeoutRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<any>(null);
  const connectionAttemptsRef = useRef(0);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
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
      // Check if component is still mounted before sending heartbeat
      if (
        isMountedRef.current &&
        websocketRef.current?.readyState === WebSocket.OPEN
      ) {
        websocketRef.current.send(JSON.stringify({ action: "ping" }));
        startHeartbeat(); // Schedule next heartbeat
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  // Use a ref to break circular dependency
  const connectInternalRef = useRef<(() => void) | null>(null);

  const attemptReconnect = useCallback(() => {
    if (connectionAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setState((prev) => ({
        ...prev,
        error: "Maximum reconnection attempts reached",
        isConnecting: false,
      }));
      return;
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      // Only attempt reconnect if component is still mounted
      if (isMountedRef.current && connectInternalRef.current) {
        connectionAttemptsRef.current++;
        setState((prev) => ({
          ...prev,
          connectionAttempts: connectionAttemptsRef.current,
        }));
        connectInternalRef.current();
      }
    }, RECONNECT_DELAY);
  }, []);

  const connectInternal = useCallback(() => {
    if (!url) return;

    setState((prev) => ({
      ...prev,
      isConnecting: true,
      error: null,
    }));

    try {
      cleanup();

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          error: "Connection timeout",
          isConnecting: false,
        }));
        cleanup();
      }, CONNECTION_TIMEOUT);

      websocketRef.current = new WebSocket(url);

      websocketRef.current.onopen = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        connectionAttemptsRef.current = 0;
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
          // Validate message structure
          if (!message.type || typeof message.type !== "string") {
            throw new Error("Invalid message format: missing or invalid type");
          }
          setState((prev) => ({
            ...prev,
            lastMessage: message,
            error: null,
          }));
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
          setState((prev) => ({
            ...prev,
            error: `Failed to parse message: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          }));
        }
      };

      websocketRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          error: "Connection error occurred",
          isConnected: false,
          isConnecting: false,
        }));
      };

      websocketRef.current.onclose = () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
        }));

        // Auto-reconnect if we haven't exceeded max attempts
        if (connectionAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          attemptReconnect();
        }
      };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: "Failed to create WebSocket connection",
        isConnecting: false,
      }));
    }
  }, [url, cleanup, startHeartbeat, attemptReconnect]);

  // Assign connectInternal to ref to break circular dependency
  connectInternalRef.current = connectInternal;

  const connect = useCallback(() => {
    connectionAttemptsRef.current = 0;
    connectInternal();
  }, [connectInternal]);

  const disconnect = useCallback(() => {
    cleanup();
    connectionAttemptsRef.current = 0;
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
        error: `Failed to send command: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      }));
      return false;
    }
  }, []);

  const resetConnection = useCallback(() => {
    connectionAttemptsRef.current = 0;
    setState((prev) => ({
      ...prev,
      connectionAttempts: 0,
      error: null,
    }));
    if (url) {
      connectInternal();
    }
  }, [url, connectInternal]);

  // Fix race condition by using refs to track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Mark as mounted when effect runs
    isMountedRef.current = true;

    if (url) {
      connect();
    }

    return () => {
      // Mark as unmounted and cleanup
      isMountedRef.current = false;
      cleanup();
    };
  }, [url]); // Only depend on url, connect is stable via useCallback

  return {
    ...state,
    connect,
    disconnect,
    sendCommand,
    resetConnection,
  };
};

export default useWebSocket;
