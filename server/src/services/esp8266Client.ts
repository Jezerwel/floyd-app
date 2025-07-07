/**
 * ESP8266 Client Service
 * WebSocket client that connects to the actual ESP8266 hardware
 * Acts as a bridge between the Express server and ESP8266
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { DeviceCommand } from "../types";

export interface ESP8266Config {
  host: string;
  port: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
}

export class ESP8266Client extends EventEmitter {
  private config: ESP8266Config;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer?: any;
  private connectionTimer?: any;
  private pingTimer?: any;
  private lastPingTime: number = 0;

  // Keepalive settings
  private readonly PING_INTERVAL = 45000; // 45 seconds (less frequent than React Native)
  private readonly PING_TIMEOUT = 10000; // 10 seconds for ESP8266 to respond

  constructor(config: ESP8266Config) {
    super();
    this.config = config;
  }

  /**
   * Connect to ESP8266
   */
  public async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    const url = `ws://${this.config.host}:${this.config.port}`;

    console.log(`🔌 Connecting to ESP8266 at ${url}...`);

    try {
      this.ws = new WebSocket(url);

      // Set connection timeout
      this.connectionTimer = setTimeout(() => {
        console.error(`❌ Connection to ESP8266 timed out`);
        this.handleConnectionError(new Error("Connection timeout"));
      }, this.config.connectionTimeout);

      this.ws.on("open", () => {
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = undefined;
        }

        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        console.log(`✅ Connected to ESP8266 at ${url}`);

        // Start keepalive ping to ESP8266
        this.startKeepAlive();

        this.emit("connected");
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle ping responses from ESP8266
          if (
            message.type === "command_response" &&
            message.action === "ping"
          ) {
            this.lastPingTime = Date.now();
            console.log(`📍 ESP8266 ping response received`);
            return; // Don't emit ping responses
          }

          console.log(`📨 Message from ESP8266:`, message.type);
          this.emit("message", message);
        } catch (error) {
          console.error(`❌ Failed to parse ESP8266 message:`, error);
          this.emit("error", new Error("Invalid message format from ESP8266"));
        }
      });

      this.ws.on("close", (code: number, reason: string) => {
        this.handleDisconnection(code, reason.toString());
      });

      this.ws.on("error", (error: Error) => {
        console.error(`❌ ESP8266 WebSocket error:`, error);
        this.handleConnectionError(error);
      });
    } catch (error) {
      this.isConnecting = false;
      console.error(`❌ Failed to create ESP8266 connection:`, error);
      this.emit("error", error);
    }
  }

  /**
   * Start keepalive ping to ESP8266
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();

    this.pingTimer = setInterval(() => {
      if (this.isConnected && this.ws) {
        // Check if ESP8266 responded to last ping
        const now = Date.now();
        if (
          this.lastPingTime > 0 &&
          now - this.lastPingTime > this.PING_INTERVAL + this.PING_TIMEOUT
        ) {
          console.warn(
            `⚠️ ESP8266 failed to respond to ping, may be unresponsive`
          );
          // Don't disconnect immediately, ESP8266 might be busy
        }

        // Send ping to ESP8266
        this.sendCommand({ action: "ping" });
        console.log(`📍 Sent keepalive ping to ESP8266`);
      }
    }, this.PING_INTERVAL);

    this.lastPingTime = Date.now();
  }

  /**
   * Stop keepalive ping
   */
  private stopKeepAlive(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * Disconnect from ESP8266
   */
  public disconnect(): void {
    console.log(`🔌 Disconnecting from ESP8266...`);

    this.stopKeepAlive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    this.emit("disconnected");
  }

  /**
   * Send command to ESP8266
   */
  public sendCommand(command: DeviceCommand): boolean {
    if (!this.isConnected || !this.ws) {
      console.warn(`⚠️ Cannot send command: not connected to ESP8266`);
      return false;
    }

    try {
      const message = {
        ...command,
        timestamp: Date.now(),
      };

      this.ws.send(JSON.stringify(message));
      console.log(`📤 Command sent to ESP8266: ${command.action}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send command to ESP8266:`, error);
      this.emit("error", error);
      return false;
    }
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }

    this.isConnecting = false;
    this.isConnected = false;

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    this.emit("error", error);
    this.attemptReconnect();
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(code: number, reason: string): void {
    this.isConnected = false;
    this.isConnecting = false;

    this.stopKeepAlive();

    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = null;
    }

    let disconnectReason = `Connection closed (code: ${code})`;
    if (reason) {
      disconnectReason += ` - ${reason}`;
    }

    console.log(`📡 ESP8266 disconnected: ${disconnectReason}`);
    this.emit("disconnected", { code, reason });

    // Be more selective about reconnection to avoid loops
    // Only reconnect for specific error codes, not all unexpected disconnections
    if (code === 1006 || code === 1011 || code === 1014) {
      // 1006 = abnormal closure, 1011 = server error, 1014 = bad gateway
      console.log(`🔄 Will attempt reconnection for ESP8266 (code: ${code})`);
      this.attemptReconnect();
    } else if (code !== 1000 && code !== 1001) {
      // Don't reconnect for normal closure (1000) or going away (1001)
      console.log(
        `ℹ️ ESP8266 disconnected normally (code: ${code}), no reconnection needed`
      );
    }
  }

  /**
   * Attempt to reconnect to ESP8266
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached for ESP8266`);
      this.emit("maxReconnectAttemptsReached");
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `🔄 Attempting to reconnect to ESP8266 (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error(`❌ Reconnection attempt failed:`, error);
      });
    }, this.config.reconnectDelay);
  }

  /**
   * Get connection status
   */
  public getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      config: this.config,
    };
  }

  /**
   * Update ESP8266 connection configuration
   */
  public updateConfig(newConfig: Partial<ESP8266Config>): void {
    const wasConnected = this.isConnected;

    if (wasConnected) {
      this.disconnect();
    }

    this.config = { ...this.config, ...newConfig };
    console.log(`⚙️ ESP8266 config updated:`, this.config);

    if (wasConnected) {
      // Reconnect with new config
      setTimeout(() => {
        this.connect();
      }, 1000);
    }
  }

  /**
   * Force reconnection
   */
  public forceReconnect(): void {
    console.log(`🔄 Force reconnecting to ESP8266...`);
    this.disconnect();
    setTimeout(() => {
      this.reconnectAttempts = 0;
      this.connect();
    }, 1000);
  }
}
