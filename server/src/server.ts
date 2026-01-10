/**
 * Floyd Fish Feeder Express Proxy Server
 * TypeScript Express server with WebSocket proxy support
 * Bridges React Native app and ESP8266 hardware via MQTT or direct connection
 */

import cors from "cors";
import express from "express";
import { createServer } from "http";
import WebSocket from "ws";
import { ESP8266Client } from "./services/esp8266Client";
import { MQTTBridge } from "./services/mqttBridge";
import { DEFAULT_SERVER_CONFIG, ServerConfig, DeviceCommand, isValidCommand } from "./types";
import { WebSocketProxyHandler } from "./websocket/proxyHandlers";
import { v4 as uuidv4 } from "uuid";

interface MQTTClientInfo {
  id: string;
  socket: WebSocket;
  deviceId: string;
  connectedAt: number;
}

class FloydFeederProxyServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss?: WebSocket.Server;
  private config: ServerConfig;

  // Services
  private esp8266Client: ESP8266Client;
  private wsProxyHandler: WebSocketProxyHandler;
  private mqttBridge?: MQTTBridge;

  // MQTT mode clients
  private mqttClients: Map<string, MQTTClientInfo> = new Map();
  private lastMQTTData: Map<string, Record<string, unknown>> = new Map();

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };

    // Initialize ESP8266 client (for direct connection mode)
    this.esp8266Client = new ESP8266Client(this.config.esp8266Config);
    this.wsProxyHandler = new WebSocketProxyHandler(this.esp8266Client);

    // Initialize MQTT bridge if enabled
    if (this.config.useMqtt && this.config.mqttConfig) {
      this.mqttBridge = new MQTTBridge(this.config.mqttConfig);
      this.setupMQTTListeners();
    }

    // Setup Express application
    this.app = express();
    this.setupExpress();

    // Create HTTP server
    this.server = createServer(this.app);

    console.log("🚀 Floyd Feeder Proxy Server initialized");
    console.log(`⚙️  Mode: ${this.config.useMqtt ? "MQTT" : "Direct ESP8266"}`);
    console.log("⚙️  Configuration:", JSON.stringify(this.config, null, 2));
  }

  private setupMQTTListeners(): void {
    if (!this.mqttBridge) return;

    this.mqttBridge.on("message", (message) => {
      this.lastMQTTData.set(message.deviceId, message.data);
      this.broadcastMQTTMessage(message.deviceId, {
        type: message.type === "sensors" ? "sensor_data" : message.type === "response" ? "control_response" : "status",
        data: message.data,
        timestamp: message.timestamp,
      });
    });

    this.mqttBridge.on("connected", () => {
      console.log("✅ MQTT Bridge connected");
      this.broadcastMQTTStatus("MQTT connected");
    });

    this.mqttBridge.on("disconnected", () => {
      console.log("📴 MQTT Bridge disconnected");
      this.broadcastMQTTStatus("MQTT disconnected");
    });

    this.mqttBridge.on("error", (error: Error) => {
      console.error("❌ MQTT Bridge error:", error.message);
    });
  }

  private broadcastMQTTMessage(deviceId: string, message: Record<string, unknown>): void {
    const messageStr = JSON.stringify(message);
    this.mqttClients.forEach((client) => {
      if (client.deviceId === deviceId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(messageStr);
      }
    });
  }

  private broadcastMQTTStatus(status: string): void {
    const message = JSON.stringify({
      type: "status",
      data: { message: status, mqttConnected: this.mqttBridge?.getStatus().isConnected },
      timestamp: Date.now(),
    });
    this.mqttClients.forEach((client) => {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(message);
      }
    });
  }

  private handleMQTTClientConnection(socket: WebSocket, request: Request & { socket: { remoteAddress: string } }): string {
    const clientId = uuidv4();
    const deviceId = "default";

    const clientInfo: MQTTClientInfo = {
      id: clientId,
      socket,
      deviceId,
      connectedAt: Date.now(),
    };

    this.mqttClients.set(clientId, clientInfo);
    console.log(`📱 MQTT mode client connected: ${clientId}`);

    // Send last known data
    const lastData = this.lastMQTTData.get(deviceId);
    if (lastData) {
      socket.send(JSON.stringify({ type: "sensor_data", data: lastData, timestamp: Date.now() }));
    }

    // Send MQTT status
    socket.send(JSON.stringify({
      type: "status",
      data: {
        mqttConnected: this.mqttBridge?.getStatus().isConnected,
        esp8266Connected: true,
        proxyServerConnected: true,
      },
      timestamp: Date.now(),
    }));

    socket.on("message", (data: WebSocket.Data) => {
      this.handleMQTTClientMessage(clientId, data);
    });

    socket.on("close", () => {
      this.mqttClients.delete(clientId);
      console.log(`📱 MQTT mode client disconnected: ${clientId}`);
    });

    return clientId;
  }

  private handleMQTTClientMessage(clientId: string, data: WebSocket.Data): void {
    const client = this.mqttClients.get(clientId);
    if (!client || !this.mqttBridge) return;

    try {
      const command = JSON.parse(data.toString());

      if (command.action === "ping") {
        client.socket.send(JSON.stringify({
          type: "status",
          data: { pong: true },
          timestamp: Date.now(),
        }));
        return;
      }

      if (command.action === "set_device") {
        client.deviceId = command.parameters?.deviceId || "default";
        console.log(`📱 Client ${clientId} set device to: ${client.deviceId}`);
        return;
      }

      if (!isValidCommand(command)) {
        client.socket.send(JSON.stringify({
          type: "error",
          data: { message: "Invalid command format" },
          timestamp: Date.now(),
        }));
        return;
      }

      console.log(`📨 MQTT command from ${clientId}: ${command.action}`);
      this.mqttBridge.sendCommand(client.deviceId, command as DeviceCommand);
    } catch (error) {
      console.error(`❌ Failed to parse message from MQTT client ${clientId}:`, error);
    }
  }

  /**
   * Setup Express middleware and routes
   */
  private setupExpress(): void {
    // CORS middleware
    this.app.use(
      cors({
        origin: [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "exp://127.0.0.1:8081",
        ],
        credentials: true,
      })
    );

    // JSON parsing middleware
    this.app.use(express.json());

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      const esp8266Status = this.esp8266Client.getStatus();
      const mqttStatus = this.mqttBridge?.getStatus();

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        mode: this.config.useMqtt ? "mqtt" : "direct",
        proxyServer: {
          uptime: Date.now() - this.startTime,
          connectedClients: this.config.useMqtt
            ? this.mqttClients.size
            : this.wsProxyHandler.getClientsInfo().length,
        },
        mqtt: this.config.useMqtt
          ? {
              connected: mqttStatus?.isConnected,
              subscribedDevices: mqttStatus?.subscribedDevices,
              messageCount: mqttStatus?.messageCount,
            }
          : null,
        esp8266: !this.config.useMqtt
          ? {
              connected: esp8266Status.isConnected,
              connecting: esp8266Status.isConnecting,
              reconnectAttempts: esp8266Status.reconnectAttempts,
              host: esp8266Status.config.host,
              port: esp8266Status.config.port,
            }
          : null,
      });
    });

    // Proxy server statistics endpoint
    this.app.get("/stats", (req, res) => {
      const stats = this.wsProxyHandler.getStats();
      res.json({
        proxyServer: {
          uptime: Date.now() - this.startTime,
          startTime: this.startTime,
          config: this.config,
        },
        websocket: stats,
      });
    });

    // ESP8266 management endpoints
    this.app.post("/api/esp8266/connect", (req, res) => {
      this.esp8266Client.connect();
      res.json({
        success: true,
        message: "ESP8266 connection initiated",
      });
    });

    this.app.post("/api/esp8266/disconnect", (req, res) => {
      this.esp8266Client.disconnect();
      res.json({
        success: true,
        message: "ESP8266 disconnected",
      });
    });

    this.app.post("/api/esp8266/reconnect", (req, res) => {
      this.wsProxyHandler.forceESP8266Reconnect();
      res.json({
        success: true,
        message: "ESP8266 reconnection initiated",
      });
    });

    this.app.get("/api/esp8266/status", (req, res) => {
      const status = this.esp8266Client.getStatus();
      res.json(status);
    });

    this.app.put("/api/esp8266/config", (req, res) => {
      const {
        host,
        port,
        reconnectDelay,
        maxReconnectAttempts,
        connectionTimeout,
      } = req.body;

      try {
        this.wsProxyHandler.updateESP8266Config({
          host,
          port,
          reconnectDelay,
          maxReconnectAttempts,
          connectionTimeout,
        });

        res.json({
          success: true,
          message: "ESP8266 configuration updated",
          config: this.esp8266Client.getStatus().config,
        });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: "Invalid configuration parameters",
        });
      }
    });

    // Proxy command endpoints (for testing direct ESP8266 commands)
    this.app.post("/api/command", (req, res) => {
      const { action, parameters } = req.body;

      if (!action) {
        res.status(400).json({
          success: false,
          message: "Missing action parameter",
        });
        return;
      }

      const success = this.esp8266Client.sendCommand({ action, parameters });
      res.json({
        success,
        message: success
          ? `Command ${action} sent to ESP8266`
          : "Failed to send command to ESP8266",
      });
    });

    // Connected clients endpoint
    this.app.get("/api/clients", (req, res) => {
      const clients = this.wsProxyHandler.getClientsInfo();
      res.json({
        count: clients.length,
        clients,
      });
    });

    // Server configuration endpoint
    this.app.get("/api/config", (req, res) => {
      res.json({
        server: this.config,
        esp8266: this.esp8266Client.getStatus().config,
      });
    });

    // 404 handler
    this.app.use("*", (req, res) => {
      res.status(404).json({
        error: "Endpoint not found",
        message: "This Floyd Feeder proxy server endpoint does not exist",
        availableEndpoints: [
          "GET /health",
          "GET /stats",
          "GET /api/esp8266/status",
          "GET /api/clients",
          "GET /api/config",
          "POST /api/esp8266/connect",
          "POST /api/esp8266/disconnect",
          "POST /api/esp8266/reconnect",
          "POST /api/command",
          "PUT /api/esp8266/config",
          "WebSocket: ws://localhost:" + this.config.port,
        ],
      });
    });

    // Error handling middleware
    this.app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        console.error("❌ Express error:", err);
        res.status(500).json({
          error: "Internal server error",
          message: err.message || "An unexpected error occurred",
        });
      }
    );
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    this.wss = new WebSocket.Server({
      server: this.server,
      path: "/",
    });

    console.log("🔌 WebSocket proxy server created");

    // Handle WebSocket connections from React Native apps
    this.wss.on("connection", (socket: WebSocket, request) => {
      if (this.config.useMqtt && this.mqttBridge) {
        const clientId = this.handleMQTTClientConnection(socket, request as Request & { socket: { remoteAddress: string } });
        console.log(`✅ MQTT mode WebSocket connection established: ${clientId}`);
      } else {
        const clientId = this.wsProxyHandler.handleConnection(socket, request);
        console.log(`✅ Direct mode WebSocket connection established: ${clientId}`);
      }
    });

    console.log(
      `📡 WebSocket proxy server listening for React Native connections`
    );
  }

  private startTime: number = Date.now();

  /**
   * Start the proxy server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Setup WebSocket before starting server
        this.setupWebSocket();

        this.server.listen(this.config.port, () => {
          console.log("🎯 ======================================");
          console.log("🐟 Floyd Fish Feeder Proxy Server READY");
          console.log("🎯 ======================================");
          console.log(`🌐 HTTP Server: http://localhost:${this.config.port}`);
          console.log(`🔌 WebSocket: ws://localhost:${this.config.port}`);
          console.log(
            `💡 Health Check: http://localhost:${this.config.port}/health`
          );
          console.log(
            `📊 Statistics: http://localhost:${this.config.port}/stats`
          );
          console.log(
            `🔧 ESP8266 Status: http://localhost:${this.config.port}/api/esp8266/status`
          );
          console.log(
            `📱 Connect your React Native app to: ws://localhost:${this.config.port}`
          );
          if (this.config.useMqtt) {
            console.log(
              `🔌 MQTT Broker: ${this.config.mqttConfig?.brokerUrl}`
            );
          } else {
            console.log(
              `🔌 ESP8266 target: ws://${this.config.esp8266Config.host}:${this.config.esp8266Config.port}`
            );
          }
          console.log("🎯 ======================================");

          // Start appropriate connection
          if (this.config.useMqtt && this.mqttBridge) {
            this.mqttBridge.connect().catch((err) => {
              console.error("❌ Failed to connect to MQTT broker:", err);
            });
          } else {
            this.esp8266Client.connect();
          }

          resolve();
        });

        this.server.on("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            console.error(`❌ Port ${this.config.port} is already in use`);
            console.log(`💡 Try a different port or stop the other service`);
          } else {
            console.error("❌ Server error:", err);
          }
          reject(err);
        });
      } catch (error) {
        console.error("❌ Failed to start proxy server:", error);
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log("🔄 Shutting down Floyd Feeder Proxy Server...");

      // Stop WebSocket proxy
      this.wsProxyHandler.shutdown();

      // Disconnect MQTT if enabled
      if (this.mqttBridge) {
        this.mqttBridge.disconnect();
        console.log("📡 MQTT Bridge disconnected");
      }

      // Close MQTT mode clients
      this.mqttClients.forEach((client) => {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.close(1001, "Server shutdown");
        }
      });
      this.mqttClients.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close(() => {
          console.log("🔌 WebSocket proxy server closed");
        });
      }

      // Close HTTP server
      this.server.close(() => {
        console.log("🌐 HTTP server closed");
        console.log("✅ Floyd Feeder Proxy Server shutdown complete");
        resolve();
      });
    });
  }

  /**
   * Get server instance for testing
   */
  public getApp(): express.Application {
    return this.app;
  }

  /**
   * Get server configuration
   */
  public getConfig(): ServerConfig {
    return { ...this.config };
  }
}

// Handle process signals for graceful shutdown
let server: FloydFeederProxyServer;

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🔄 Received ${signal}, initiating graceful shutdown...`);

  if (server) {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Start server if this file is run directly
if (require.main === module) {
  console.log("🚀 Starting Floyd Fish Feeder Proxy Server...");

  // Parse command line arguments for custom configuration
  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace("--", "");
    const value = args[i + 1];

    if (key === "port" && value) {
      config.port = parseInt(value, 10);
    } else if (key === "esp8266-host" && value) {
      config.esp8266Config = {
        ...DEFAULT_SERVER_CONFIG.esp8266Config,
        host: value,
      };
    } else if (key === "esp8266-port" && value) {
      config.esp8266Config = {
        ...(config.esp8266Config || DEFAULT_SERVER_CONFIG.esp8266Config),
        port: parseInt(value, 10),
      };
    }
  }

  server = new FloydFeederProxyServer(config);

  server.start().catch((error) => {
    console.error("❌ Failed to start proxy server:", error);
    process.exit(1);
  });
}

export default FloydFeederProxyServer;
