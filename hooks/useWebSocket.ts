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

const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5
const RECONNECT_DELAY = 5000; // Increased from 3000ms
const CONNECTION_TIMEOUT = 15000; // Increased from 10 seconds
const HEARTBEAT_INTERVAL = 60000; // Increased from 30 seconds (let proxy handle keepalive)

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
        // Only send ping if we haven't received any message recently
        const lastMessageTime = state.lastMessage?.timestamp || 0;
        const now = Date.now();

        // If we got a message in the last 30 seconds, skip ping
        if (now - lastMessageTime < 30000) {
          startHeartbeat(); // Just schedule next heartbeat
          return;
        }

        websocketRef.current.send(JSON.stringify({ action: "ping" }));
        startHeartbeat(); // Schedule next heartbeat
      }
    }, HEARTBEAT_INTERVAL);
  }, [state.lastMessage?.timestamp]);

  // Use a ref to break circular dependency
  const connectInternalRef = useRef<(() => void) | null>(null);

  const attemptReconnect = useCallback(() => {
    if (connectionAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setState((prev) => ({
        ...prev,
        error:
          "Maximum reconnection attempts reached. Please check connection and try again.",
        isConnecting: false,
      }));
      return;
    }

    // Exponential backoff: increase delay with each attempt
    const delay =
      RECONNECT_DELAY * Math.pow(1.5, connectionAttemptsRef.current);

    console.log(
      `⏱️ Reconnecting in ${Math.round(delay / 1000)}s (attempt ${
        connectionAttemptsRef.current + 1
      }/${MAX_RECONNECT_ATTEMPTS})`
    );

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
    }, delay);
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

      // Ensure URL has proper WebSocket protocol
      const wsUrl =
        url.startsWith("ws://") || url.startsWith("wss://")
          ? url
          : `ws://${url}`;

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          error: "Connection timeout",
          isConnecting: false,
        }));
        cleanup();
      }, CONNECTION_TIMEOUT);

      websocketRef.current = new WebSocket(wsUrl);

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
            console.warn("Received message with invalid format:", message);
            return; // Don't set error, just skip invalid messages
          }

          // Clear any previous errors on successful message
          setState((prev) => ({
            ...prev,
            lastMessage: message,
            error: null,
          }));
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
          // Don't disconnect for parse errors, just log them
          console.warn("Raw message data:", event.data);
        }
      };

      websocketRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);

        // Don't clear connection timeout here, let onclose handle it
        // This prevents race conditions between error and close events

        let errorMessage = "Connection error occurred";
        // More specific error handling
        if (error && typeof error === "object" && "message" in error) {
          const msg = (error as any).message?.toLowerCase() || "";
          if (msg.includes("reset") || msg.includes("connection reset")) {
            errorMessage = "Connection was reset";
          } else if (msg.includes("timeout")) {
            errorMessage = "Connection timed out";
          } else if (msg.includes("refused") || msg.includes("econnrefused")) {
            errorMessage = "Connection refused - server may be offline";
          } else if (msg.includes("network") || msg.includes("unreachable")) {
            errorMessage = "Network error - check your connection";
          }
        }

        // Only update error, don't change connection state
        // Let onclose handle the connection state changes
        setState((prev) => ({
          ...prev,
          error: errorMessage,
        }));
      };

      websocketRef.current.onclose = (event) => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }

        // More specific close reason handling
        let closeReason = "";
        let shouldReconnect = false;

        if (event.code === 1006) {
          closeReason = "Connection lost unexpectedly";
          shouldReconnect = true;
        } else if (event.code === 1000) {
          closeReason = "Connection closed normally";
          shouldReconnect = false; // Normal closure, don't reconnect
        } else if (event.code === 1001) {
          closeReason = "Server is shutting down";
          shouldReconnect = false; // Server shutdown, don't reconnect
        } else if (event.code === 1011) {
          closeReason = "Server encountered an error";
          shouldReconnect = true;
        } else if (event.code >= 3000) {
          closeReason = "Application-specific error occurred";
          shouldReconnect = true;
        } else {
          closeReason = `Connection closed (code: ${event.code})`;
          shouldReconnect = event.code !== 1000 && event.code !== 1001;
        }

        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          error: prev.error || closeReason,
        }));

        // Only auto-reconnect for specific cases and if we haven't exceeded max attempts
        if (
          shouldReconnect &&
          connectionAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
        ) {
          console.log(
            `🔄 WebSocket closed (${event.code}), will attempt reconnection`
          );
          setTimeout(() => {
            if (isMountedRef.current) {
              attemptReconnect();
            }
          }, 2000); // Fixed 2-second delay for all reconnections
        } else if (!shouldReconnect) {
          console.log(
            `ℹ️ WebSocket closed normally (${event.code}), no reconnection needed`
          );
        } else {
          console.log(`❌ Max reconnection attempts reached, stopping`);
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
