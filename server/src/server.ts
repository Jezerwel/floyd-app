/**
 * Floyd Fish Feeder Express Proxy Server
 * TypeScript Express server with WebSocket proxy support
 * Bridges React Native app and ESP8266 hardware via direct WebSocket connection
 */

import cors from "cors";
import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { ESP8266Client } from "./services/esp8266Client";
import { DEFAULT_SERVER_CONFIG, ServerConfig } from "./types";
import { WebSocketProxyHandler } from "./websocket/proxyHandlers";
import FeedScheduler from "./services/scheduler";
import prisma from "./services/db";
import type { Request, Response, NextFunction } from "express";

class FloydFeederProxyServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private wss?: WebSocketServer;
  private config: ServerConfig;

  private esp8266Client: ESP8266Client;
  private wsProxyHandler: WebSocketProxyHandler;
  private scheduler: FeedScheduler;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };

    this.esp8266Client = new ESP8266Client(this.config.esp8266Config);
    this.wsProxyHandler = new WebSocketProxyHandler(this.esp8266Client);
    this.scheduler = new FeedScheduler(this.esp8266Client);

    this.app = express();
    this.setupExpress();

    this.server = createServer(this.app);

    console.log("Floyd Feeder Proxy Server initialized");
    console.log("Configuration:", JSON.stringify(this.config, null, 2));
  }

  private setupExpress(): void {
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

    this.app.use(express.json());

    this.app.get("/health", (_req: Request, res: Response) => {
      const esp8266Status = this.esp8266Client.getStatus();

      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        mode: "direct",
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

    this.app.get("/stats", (_req: Request, res: Response) => {
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

    this.app.post("/api/esp8266/connect", (_req: Request, res: Response) => {
      this.esp8266Client.connect();
      res.json({ success: true, message: "ESP8266 connection initiated" });
    });

    this.app.post("/api/esp8266/disconnect", (_req: Request, res: Response) => {
      this.esp8266Client.disconnect();
      res.json({ success: true, message: "ESP8266 disconnected" });
    });

    this.app.post("/api/esp8266/reconnect", (_req: Request, res: Response) => {
      this.wsProxyHandler.forceESP8266Reconnect();
      res.json({ success: true, message: "ESP8266 reconnection initiated" });
    });

    this.app.get("/api/esp8266/status", (_req: Request, res: Response) => {
      const status = this.esp8266Client.getStatus();
      res.json(status);
    });

    this.app.put("/api/esp8266/config", (req: Request, res: Response) => {
      const { host, port, reconnectDelay, maxReconnectAttempts, connectionTimeout } = req.body;
      try {
        this.wsProxyHandler.updateESP8266Config({ host, port, reconnectDelay, maxReconnectAttempts, connectionTimeout });
        res.json({
          success: true,
          message: "ESP8266 configuration updated",
          config: this.esp8266Client.getStatus().config,
        });
      } catch {
        res.status(400).json({ success: false, message: "Invalid configuration parameters" });
      }
    });

    this.app.post("/api/command", (req: Request, res: Response) => {
      const { action, parameters } = req.body;
      if (!action) {
        res.status(400).json({ success: false, message: "Missing action parameter" });
        return;
      }
      const success = this.esp8266Client.sendCommand({ action, parameters });
      res.json({
        success,
        message: success ? `Command ${action} sent to ESP8266` : "Failed to send command to ESP8266",
      });
    });

    this.app.get("/api/clients", (_req: Request, res: Response) => {
      const clients = this.wsProxyHandler.getClientsInfo();
      res.json({ count: clients.length, clients });
    });

    this.app.get("/api/config", (_req: Request, res: Response) => {
      res.json({
        server: this.config,
        esp8266: this.esp8266Client.getStatus().config,
      });
    });

    // Async handler wrapper for Express 4
    const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
      (req: Request, res: Response) => {
        fn(req, res).catch((err: Error) => {
          console.error(err);
          res.status(500).json({ success: false, error: 'Internal server error' });
        });
      };

    // Schedule endpoints
    this.app.get("/api/schedules", asyncHandler(async (_req, res) => {
      const schedules = await prisma.feedSchedule.findMany({ orderBy: { createdAt: 'asc' } });
      res.json({ success: true, schedules });
    }));

    this.app.post("/api/schedules", asyncHandler(async (req, res) => {
      const { label, time, daysOfWeek, augerSpeed, impellerSpeed, preSpinMs, feedMs, postSpinMs } = req.body;
      const schedule = await prisma.feedSchedule.create({
        data: {
          label: label || 'Feed',
          time,
          daysOfWeek: daysOfWeek || '0,1,2,3,4,5,6',
          augerSpeed: augerSpeed || 768,
          impellerSpeed: impellerSpeed || 1023,
          preSpinMs: preSpinMs || 1500,
          feedMs: feedMs || 3000,
          postSpinMs: postSpinMs || 1500,
          enabled: true,
        },
      });
      this.scheduler.addJob(schedule);
      res.status(201).json({ success: true, schedule });
    }));

    this.app.put("/api/schedules/:id", asyncHandler(async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      this.scheduler.removeJob(id);
      const schedule = await prisma.feedSchedule.update({ where: { id }, data });
      if (schedule.enabled) {
        this.scheduler.addJob(schedule);
      }
      res.json({ success: true, schedule });
    }));

    this.app.delete("/api/schedules/:id", asyncHandler(async (req, res) => {
      const { id } = req.params;
      this.scheduler.removeJob(id);
      await prisma.feedSchedule.delete({ where: { id } });
      res.json({ success: true });
    }));

    // History endpoint
    this.app.get("/api/history", asyncHandler(async (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await prisma.feedLog.findMany({ orderBy: { timestamp: 'desc' }, take: limit });
      res.json({ success: true, logs });
    }));

    // Alert config endpoints
    this.app.get("/api/alerts/config", asyncHandler(async (_req, res) => {
      const config = await prisma.alertConfig.findUnique({ where: { id: 'default' } });
      res.json({ success: true, config: config || { lowFoodPct: 30, criticalFoodPct: 10, tempMin: 20, tempMax: 32 } });
    }));

    this.app.put("/api/alerts/config", asyncHandler(async (req, res) => {
      const { lowFoodPct, criticalFoodPct, tempMin, tempMax } = req.body;
      const config = await prisma.alertConfig.upsert({
        where: { id: 'default' },
        update: { lowFoodPct, criticalFoodPct, tempMin, tempMax },
        create: { id: 'default', lowFoodPct, criticalFoodPct, tempMin, tempMax },
      });
      res.json({ success: true, config });
    }));

    this.app.use("*", (req, res) => {
      res.status(404).json({
        error: "Endpoint not found",
        message: "This Floyd Feeder proxy server endpoint does not exist",
        availableEndpoints: [
          "GET /health", "GET /stats",
          "GET /api/schedules", "POST /api/schedules", "PUT /api/schedules/:id", "DELETE /api/schedules/:id",
          "GET /api/history",
          "GET /api/alerts/config", "PUT /api/alerts/config",
          "GET /api/esp8266/status", "GET /api/clients", "GET /api/config",
          "POST /api/esp8266/connect", "POST /api/esp8266/disconnect", "POST /api/esp8266/reconnect",
          "POST /api/command", "PUT /api/esp8266/config",
          "WebSocket: ws://localhost:" + this.config.port,
        ],
      });
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Express error:", err);
      res.status(500).json({ error: "Internal server error", message: err.message || "An unexpected error occurred" });
    });
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.server, path: "/" });
    console.log("WebSocket proxy server created");

    this.wss.on("connection", (socket: WebSocket, request) => {
      const clientId = this.wsProxyHandler.handleConnection(socket, request);
      console.log(`WebSocket connection established: ${clientId}`);
    });

    console.log("WebSocket proxy server listening for React Native connections");
  }

  private startTime: number = Date.now();

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.setupWebSocket();

        this.server.listen(this.config.port, () => {
          console.log("=====================================");
          console.log("Floyd Fish Feeder Proxy Server READY");
          console.log("=====================================");
          console.log(`HTTP Server: http://localhost:${this.config.port}`);
          console.log(`WebSocket: ws://localhost:${this.config.port}`);
          console.log(`Health Check: http://localhost:${this.config.port}/health`);
          console.log(`Stats: http://localhost:${this.config.port}/stats`);
          console.log(`ESP8266 target: ws://${this.config.esp8266Config.host}:${this.config.esp8266Config.port}`);
          console.log("=====================================");

          this.esp8266Client.connect();
          this.scheduler.start().then(() => {
            console.log("[Scheduler] Feed schedules loaded");
          });
          resolve();
        });

        this.server.on("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            console.error(`Port ${this.config.port} is already in use`);
            console.log("Try a different port or stop the other service");
          } else {
            console.error("Server error:", err);
          }
          reject(err);
        });
      } catch (error) {
        console.error("Failed to start proxy server:", error);
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      console.log("Shutting down Floyd Feeder Proxy Server...");

      this.wsProxyHandler.shutdown();
      this.scheduler.stop();

      if (this.wss) {
        this.wss.close(() => {
          console.log("WebSocket proxy server closed");
        });
      }

      this.server.close(() => {
        console.log("HTTP server closed");
        prisma.$disconnect().then(() => {
          console.log("Database disconnected");
          console.log("Floyd Feeder Proxy Server shutdown complete");
          resolve();
        });
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getConfig(): ServerConfig {
    return { ...this.config };
  }
}

let server: FloydFeederProxyServer;

const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, initiating graceful shutdown...`);
  if (server) {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  } else {
    process.exit(0);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (require.main === module) {
  console.log("Starting Floyd Fish Feeder Proxy Server...");

  const args = process.argv.slice(2);
  const config: Partial<ServerConfig> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace("--", "");
    const value = args[i + 1];

    if (key === "port" && value) {
      config.port = parseInt(value, 10);
    } else if (key === "esp8266-host" && value) {
      config.esp8266Config = { ...DEFAULT_SERVER_CONFIG.esp8266Config, host: value };
    } else if (key === "esp8266-port" && value) {
      config.esp8266Config = {
        ...(config.esp8266Config || DEFAULT_SERVER_CONFIG.esp8266Config),
        port: parseInt(value, 10),
      };
    }
  }

  server = new FloydFeederProxyServer(config);

  server.start().catch((error) => {
    console.error("Failed to start proxy server:", error);
    process.exit(1);
  });
}

export default FloydFeederProxyServer;
