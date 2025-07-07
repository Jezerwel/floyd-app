/**
 * Floyd Fish Feeder Express Proxy Server
 * TypeScript Express server with WebSocket proxy support
 * Bridges React Native app and ESP8266 hardware
 */

import cors from "cors";
import express from "express";
import { createServer } from "http";
import WebSocket from "ws";
import { ESP8266Client } from "./services/esp8266Client";
import { DEFAULT_SERVER_CONFIG, ServerConfig } from "./types";
import { WebSocketProxyHandler } from "./websocket/proxyHandlers";

class FloydFeederProxyServer {
  private app: express.Application;
  private server: any;
  private wss?: WebSocket.Server;
  private config: ServerConfig;

  // Services
  private esp8266Client: ESP8266Client;
  private wsProxyHandler: WebSocketProxyHandler;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };

    // Initialize ESP8266 client
    this.esp8266Client = new ESP8266Client(this.config.esp8266Config);
    this.wsProxyHandler = new WebSocketProxyHandler(this.esp8266Client);

    // Setup Express application
    this.app = express();
    this.setupExpress();

    // Create HTTP server
    this.server = createServer(this.app);

    console.log("🚀 Floyd Feeder Proxy Server initialized");
    console.log("⚙️  Configuration:", this.config);
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
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        proxyServer: {
          uptime: Date.now() - this.startTime,
          connectedClients: this.wsProxyHandler.getClientsInfo().length,
        },
        esp8266: {
          connected: esp8266Status.isConnected,
          connecting: esp8266Status.isConnecting,
          reconnectAttempts: esp8266Status.reconnectAttempts,
          host: esp8266Status.config.host,
          port: esp8266Status.config.port,
        },
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
      const clientId = this.wsProxyHandler.handleConnection(socket, request);
      console.log(`✅ WebSocket proxy connection established: ${clientId}`);
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
          console.log(
            `🔌 ESP8266 target: ws://${this.config.esp8266Config.host}:${this.config.esp8266Config.port}`
          );
          console.log("🎯 ======================================");

          // Start ESP8266 connection
          this.esp8266Client.connect();

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
