/**
 * WebSocket Proxy Handlers
 * Acts as a bridge between React Native app and ESP8266 hardware
 * Forwards commands and relays responses
 */

import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import { ESP8266Client } from "../services/esp8266Client";
import { ClientInfo, DeviceCommand, isValidCommand } from "../types";

export class WebSocketProxyHandler {
  private esp8266Client: ESP8266Client;
  private clients: Map<
    string,
    {
      socket: WebSocket;
      info: ClientInfo;
      lastPing?: number;
      pingInterval?: any;
    }
  > = new Map();
  private lastESP8266Data: any = null;

  // Keepalive settings
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 5000; // 5 seconds to respond to ping

  constructor(esp8266Client: ESP8266Client) {
    this.esp8266Client = esp8266Client;
    this.setupESP8266Listeners();
  }

  /**
   * Setup ESP8266 event listeners
   */
  private setupESP8266Listeners(): void {
    // Forward ESP8266 messages to all connected React Native clients
    this.esp8266Client.on("message", (message: any) => {
      this.lastESP8266Data = message;

      // Don't forward ping responses, handle them internally
      if (
        message.type === "pong" ||
        (message.type === "command_response" && message.action === "ping")
      ) {
        console.log("📍 Received ESP8266 ping response");
        return;
      }

      this.broadcastToClients(message);
    });

    // Handle ESP8266 connection status
    this.esp8266Client.on("connected", () => {
      console.log("🔗 ESP8266 connected - notifying clients");
      this.broadcastStatus("ESP8266 connected");
    });

    this.esp8266Client.on("disconnected", () => {
      console.log("📡 ESP8266 disconnected - notifying clients");
      this.broadcastError("ESP8266 disconnected");
    });

    this.esp8266Client.on("error", (error: Error) => {
      console.error("❌ ESP8266 error - notifying clients:", error.message);
      this.broadcastError(`ESP8266 error: ${error.message}`);
    });

    this.esp8266Client.on("maxReconnectAttemptsReached", () => {
      console.error("❌ ESP8266 max reconnect attempts reached");
      this.broadcastError(
        "ESP8266 connection failed - max reconnect attempts reached"
      );
    });
  }

  /**
   * Handle new React Native app connection
   */
  public handleConnection(socket: WebSocket, request: any): string {
    const clientId = uuidv4();
    const clientIP = request.socket.remoteAddress || "unknown";

    const clientInfo: ClientInfo = {
      id: clientId,
      ip: clientIP,
      connectedAt: Date.now(),
    };

    // Start keepalive for this client
    const pingInterval = setInterval(() => {
      this.sendPingToClient(clientId);
    }, this.PING_INTERVAL);

    this.clients.set(clientId, {
      socket,
      info: clientInfo,
      lastPing: Date.now(),
      pingInterval,
    });

    console.log(`📱 React Native app connected: ${clientId} from ${clientIP}`);
    console.log(`👥 Total app clients: ${this.clients.size}`);

    // Send ESP8266 connection status to new client
    this.sendConnectionStatus(socket);

    // Send last known data if available
    if (this.lastESP8266Data) {
      this.sendToClient(socket, this.lastESP8266Data);
    }

    // Set up message handler for this client
    socket.on("message", (data: WebSocket.Data) => {
      this.handleClientMessage(clientId, data);
    });

    // Handle client disconnection
    socket.on("close", () => {
      this.handleClientDisconnection(clientId);
    });

    // Handle WebSocket errors
    socket.on("error", (error) => {
      console.error(`❌ WebSocket error for client ${clientId}:`, error);
      // Don't immediately disconnect on error, let close event handle it
      // This prevents double disconnection handling
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
      socket.pong();
    });

    socket.on("pong", () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = Date.now();
      }
    });

    return clientId;
  }

  /**
   * Send ping to client and handle timeout
   */
  private sendPingToClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (client.socket.readyState !== WebSocket.OPEN) {
      this.handleClientDisconnection(clientId);
      return;
    }

    // Check if client responded to last ping
    const now = Date.now();
    if (
      client.lastPing &&
      now - client.lastPing > this.PING_INTERVAL + this.PING_TIMEOUT
    ) {
      console.warn(
        `⚠️ Client ${clientId} failed to respond to ping, disconnecting`
      );
      this.handleClientDisconnection(clientId);
      return;
    }

    try {
      // Use WebSocket ping frame instead of JSON message
      client.socket.ping();
    } catch (error) {
      console.error(`❌ Failed to ping client ${clientId}:`, error);
      this.handleClientDisconnection(clientId);
    }
  }

  /**
   * Handle React Native app disconnection
   */
  private handleClientDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      // Clear ping interval
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
      }

      console.log(
        `📱 React Native app disconnected: ${clientId} (${client.info.ip})`
      );
      this.clients.delete(clientId);
      console.log(`👥 Total app clients: ${this.clients.size}`);
    }
  }

  /**
   * Handle message from React Native app
   */
  private handleClientMessage(clientId: string, data: WebSocket.Data): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const command = JSON.parse(data.toString());

      // Handle ping commands from React Native app
      if (command.action === "ping") {
        console.log(`📍 Received ping from React Native app ${clientId}`);

        // Update last ping time
        client.info.lastPing = Date.now();
        client.lastPing = Date.now();

        // Send pong response directly to client (don't forward to ESP8266)
        this.sendToClient(client.socket, {
          type: "command_response",
          action: "ping",
          success: true,
          data: { message: "pong" },
          timestamp: Date.now(),
        });
        return;
      }

      if (!isValidCommand(command)) {
        this.sendErrorToClient(
          client.socket,
          "Invalid command format",
          command.action
        );
        return;
      }

      console.log(
        `📨 Command from React Native app ${clientId}: ${command.action}`
      );

      // Update client's last activity time
      client.info.lastPing = Date.now();

      // Forward command to ESP8266
      this.forwardCommandToESP8266(command, clientId);
    } catch (error) {
      console.error(
        `❌ Failed to parse message from client ${clientId}:`,
        error
      );
      this.sendErrorToClient(client.socket, "Invalid JSON format");
    }
  }

  /**
   * Forward command to ESP8266
   */
  private forwardCommandToESP8266(
    command: DeviceCommand,
    fromClientId: string
  ): void {
    const esp8266Status = this.esp8266Client.getStatus();

    if (!esp8266Status.isConnected) {
      console.warn(
        `⚠️ Cannot forward command ${command.action}: ESP8266 not connected`
      );
      const client = this.clients.get(fromClientId);
      if (client) {
        this.sendErrorToClient(
          client.socket,
          "ESP8266 not connected",
          command.action
        );
      }
      return;
    }

    const success = this.esp8266Client.sendCommand(command);
    if (!success) {
      console.error(
        `❌ Failed to forward command ${command.action} to ESP8266`
      );
      const client = this.clients.get(fromClientId);
      if (client) {
        this.sendErrorToClient(
          client.socket,
          "Failed to send command to ESP8266",
          command.action
        );
      }
    }
  }

  /**
   * Send connection status to a specific client
   */
  private sendConnectionStatus(socket: WebSocket): void {
    const esp8266Status = this.esp8266Client.getStatus();

    const statusMessage = {
      type: "status",
      data: {
        esp8266Connected: esp8266Status.isConnected,
        esp8266Connecting: esp8266Status.isConnecting,
        esp8266ReconnectAttempts: esp8266Status.reconnectAttempts,
        proxyServerConnected: true,
      },
      timestamp: Date.now(),
    };

    this.sendToClient(socket, statusMessage);
  }

  /**
   * Broadcast message to all connected React Native clients
   */
  private broadcastToClients(message: any): void {
    if (this.clients.size === 0) return;

    const messageStr = JSON.stringify(message);
    let successCount = 0;
    const clientsToRemove: string[] = [];

    this.clients.forEach((client, clientId) => {
      if (client.socket.readyState === WebSocket.OPEN) {
        try {
          client.socket.send(messageStr);
          successCount++;
        } catch (error) {
          console.error(`❌ Failed to broadcast to client ${clientId}:`, error);
          clientsToRemove.push(clientId);
        }
      } else {
        clientsToRemove.push(clientId);
      }
    });

    // Remove failed clients
    clientsToRemove.forEach((clientId) => {
      this.handleClientDisconnection(clientId);
    });

    if (successCount > 0) {
      console.log(`📡 Broadcasted ESP8266 data to ${successCount} clients`);
    }
  }

  /**
   * Broadcast status message to all clients
   */
  private broadcastStatus(message: string): void {
    const statusMessage = {
      type: "status",
      data: {
        message,
        esp8266Connected: this.esp8266Client.getStatus().isConnected,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    this.broadcastToClients(statusMessage);
  }

  /**
   * Broadcast error message to all clients
   */
  private broadcastError(message: string): void {
    const errorMessage = {
      type: "error",
      data: {
        message,
        source: "proxy_server",
      },
      timestamp: Date.now(),
    };

    this.broadcastToClients(errorMessage);
  }

  /**
   * Send message to specific client
   */
  private sendToClient(socket: WebSocket, message: any): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("❌ Failed to send message to client:", error);
    }
  }

  /**
   * Send error to specific client
   */
  private sendErrorToClient(
    socket: WebSocket,
    message: string,
    action?: string
  ): void {
    const errorMessage = {
      type: "error",
      data: {
        message,
        action,
        source: "proxy_server",
      },
      timestamp: Date.now(),
    };

    this.sendToClient(socket, errorMessage);
  }

  /**
   * Get connected clients information
   */
  public getClientsInfo(): ClientInfo[] {
    return Array.from(this.clients.values()).map((client) => ({
      ...client.info,
    }));
  }

  /**
   * Get proxy server statistics
   */
  public getStats() {
    const esp8266Status = this.esp8266Client.getStatus();

    return {
      connectedClients: this.clients.size,
      clients: this.getClientsInfo(),
      esp8266Status,
      lastESP8266Data: this.lastESP8266Data
        ? {
            type: this.lastESP8266Data.type,
            timestamp: this.lastESP8266Data.timestamp,
          }
        : null,
    };
  }

  /**
   * Force ESP8266 reconnection
   */
  public forceESP8266Reconnect(): void {
    console.log("🔄 Forcing ESP8266 reconnection...");
    this.esp8266Client.forceReconnect();
  }

  /**
   * Update ESP8266 configuration
   */
  public updateESP8266Config(config: any): void {
    console.log("⚙️ Updating ESP8266 configuration...");
    this.esp8266Client.updateConfig(config);
  }

  /**
   * Cleanup when shutting down
   */
  public shutdown(): void {
    console.log("🔄 Shutting down WebSocket proxy handler...");

    // Close all client connections and clear intervals
    this.clients.forEach((client, clientId) => {
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
      }
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close(1001, "Server shutdown");
      }
    });

    this.clients.clear();

    // Disconnect from ESP8266
    this.esp8266Client.disconnect();

    console.log("✅ WebSocket proxy handler shutdown complete");
  }
}
