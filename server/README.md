# Floyd Fish Feeder - Express Proxy Server

A TypeScript Express server that acts as a WebSocket proxy between your React Native app and ESP8266 hardware. This server bridges the communication, providing additional features like REST API endpoints, logging, and connection management while maintaining full compatibility with the original ESP8266 WebSocket protocol.

## 🏗️ Architecture

```
React Native App ↔ Express Proxy Server ↔ ESP8266 Hardware
```

- **React Native App**: Connects to Express server via WebSocket
- **Express Proxy Server**: Forwards commands to ESP8266 and relays responses back
- **ESP8266 Hardware**: Actual fish feeder device with sensors and motor

## ✨ Features

### WebSocket Proxy

- **Transparent Proxy**: Forwards all commands between React Native app and ESP8266
- **Multiple Clients**: Supports multiple React Native apps connecting simultaneously
- **Auto-Reconnection**: Automatically reconnects to ESP8266 if connection is lost
- **Real-time Status**: Provides connection status updates to all connected clients

### REST API

- Device control endpoints for testing
- ESP8266 connection management
- Server statistics and health monitoring
- Configuration management

### Connection Management

- **Robust Reconnection**: Configurable retry logic for ESP8266 connections
- **Connection Timeout**: Prevents hanging connections
- **Error Handling**: Comprehensive error reporting to connected clients
- **Graceful Shutdown**: Clean disconnection from all clients and ESP8266

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure ESP8266 Connection

Edit the ESP8266 configuration in `src/types/index.ts` or use environment variables:

```typescript
const DEFAULT_ESP8266_CONFIG: ESP8266Config = {
  host: "192.168.1.100", // Your ESP8266 IP address
  port: 81, // ESP8266 WebSocket port
  reconnectDelay: 3000,
  maxReconnectAttempts: 5,
  connectionTimeout: 10000,
};
```

### 3. Start the Proxy Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

### 4. Update React Native App

Change your React Native app's WebSocket connection from:

```typescript
// Old - direct ESP8266 connection
const ws = new WebSocket("ws://192.168.1.100:81");
```

To:

```typescript
// New - proxy server connection
const ws = new WebSocket("ws://localhost:3001");
```

## 🔧 Configuration

### Command Line Arguments

```bash
# Custom server port
npm run dev -- --port 3002

# Custom ESP8266 host
npm run dev -- --esp8266-host 192.168.1.150

# Custom ESP8266 port
npm run dev -- --esp8266-port 80

# Multiple arguments
npm run dev -- --port 3002 --esp8266-host 192.168.1.150 --esp8266-port 80
```

### Environment Variables

You can also configure via environment variables:

```bash
export PORT=3001
export ESP8266_HOST=192.168.1.100
export ESP8266_PORT=81
```

## 📡 API Endpoints

### Health & Status

- `GET /health` - Server and ESP8266 health status
- `GET /stats` - Detailed proxy server statistics
- `GET /api/esp8266/status` - ESP8266 connection status
- `GET /api/clients` - Connected React Native clients

### ESP8266 Management

- `POST /api/esp8266/connect` - Initiate ESP8266 connection
- `POST /api/esp8266/disconnect` - Disconnect from ESP8266
- `POST /api/esp8266/reconnect` - Force reconnection to ESP8266
- `PUT /api/esp8266/config` - Update ESP8266 connection settings

### Direct Commands (Testing)

- `POST /api/command` - Send direct command to ESP8266
  ```json
  {
    "action": "toggle_led",
    "parameters": {}
  }
  ```

### Configuration

- `GET /api/config` - Get server and ESP8266 configuration

## 🔌 WebSocket Protocol

The proxy server maintains 100% compatibility with the original ESP8266 WebSocket protocol:

### Commands (React Native App → ESP8266)

```json
// Toggle LED
{ "action": "toggle_led" }

// Toggle Relay (Feed)
{ "action": "toggle_relay" }

// Get Sensors
{ "action": "get_sensors" }

// Set Sensor Update Interval
{
  "action": "set_sensor_interval",
  "parameters": { "interval": 5000 }
}

// Ping
{ "action": "ping" }
```

### Responses (ESP8266 → React Native App)

```json
// Sensor Data
{
  "type": "sensor_data",
  "data": {
    "temperature": 24.5,
    "distance": 8.2,
    "food_level": 85.5,
    "battery_level": 92.3
  },
  "timestamp": 1704067200000
}

// Command Response
{
  "type": "command_response",
  "action": "toggle_led",
  "success": true,
  "data": { "led_state": true },
  "timestamp": 1704067200000
}
```

### Proxy Status Messages

The proxy server also sends additional status messages:

```json
// Connection Status
{
  "type": "status",
  "data": {
    "esp8266Connected": true,
    "esp8266Connecting": false,
    "esp8266ReconnectAttempts": 0,
    "proxyServerConnected": true
  },
  "timestamp": 1704067200000
}

// Error Messages
{
  "type": "error",
  "data": {
    "message": "ESP8266 not connected",
    "action": "toggle_led",
    "source": "proxy_server"
  },
  "timestamp": 1704067200000
}
```

## 🔧 Development

### Project Structure

```
server/
├── src/
│   ├── server.ts              # Main proxy server
│   ├── types/index.ts         # TypeScript interfaces
│   ├── services/
│   │   └── esp8266Client.ts   # ESP8266 WebSocket client
│   └── websocket/
│       └── proxyHandlers.ts   # WebSocket proxy handlers
├── package.json
├── tsconfig.json
├── nodemon.json
└── README.md
```

### Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run type-check` - Check TypeScript types

### Logging

The proxy server provides detailed logging:

- 🔌 Connection events
- 📨 Message forwarding
- ❌ Error conditions
- 📡 Broadcasting status
- 🔄 Reconnection attempts

## 🚨 Troubleshooting

### Connection Stability Issues

If your app keeps disconnecting and reconnecting, try these fixes:

**1. Check Network Stability**

```bash
# Test ESP8266 connectivity
ping 192.168.1.100

# Check if ESP8266 WebSocket port is open
telnet 192.168.1.100 81
```

**2. Verify Configuration**

- Ensure ESP8266 IP address is correct in `server/src/types/index.ts`
- Check that ESP8266 and proxy server are on same network
- Verify ESP8266 is running the WebSocket server

**3. Monitor Connection Logs**
The proxy server provides detailed logging:

```bash
# Watch for connection patterns
npm run dev

# Look for these patterns:
# ✅ Connected to ESP8266 - healthy
# 📡 ESP8266 disconnected - connection lost
# 🔄 Attempting to reconnect - automatic recovery
# ⚠️ Failed to respond to ping - device may be unresponsive
```

**4. Restart Services in Order**

```bash
# 1. Restart ESP8266 device (reset button)
# 2. Wait 10 seconds for WiFi reconnection
# 3. Restart proxy server
npm run dev
# 4. Reconnect React Native app
```

**5. Adjust Timeouts**
If ESP8266 is slow, increase timeouts in `server/src/types/index.ts`:

```typescript
export const DEFAULT_ESP8266_CONFIG: ESP8266Config = {
  connectionTimeout: 15000, // Increase if ESP8266 is slow
  reconnectDelay: 5000, // Increase for stability
  maxReconnectAttempts: 3, // Reduce to prevent loops
};
```

**6. Common Issues**

- **Power Supply**: ESP8266 needs stable 3.3V power
- **WiFi Range**: Move ESP8266 closer to router
- **Code Issues**: Check ESP8266 Arduino code for crashes
- **Memory Issues**: ESP8266 may restart due to low memory

### ESP8266 Connection Issues

1. **Check IP Address**: Ensure ESP8266 IP is correct
2. **Network Connectivity**: Ping the ESP8266 device
3. **Port Conflicts**: Verify port 81 is available on ESP8266
4. **Firewall**: Check firewall settings

### React Native App Issues

1. **Proxy Server Running**: Ensure proxy server is started
2. **Port Conflicts**: Check if port 3001 is available
3. **Network**: Ensure device can reach localhost/proxy server

### Common Error Messages

- `❌ ESP8266 not connected` - ESP8266 is offline or unreachable
- `⚠️ Cannot send command: not connected to ESP8266` - Command sent while ESP8266 disconnected
- `❌ Connection timeout` - ESP8266 not responding to connection attempts

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3001/health
```

### Statistics

```bash
curl http://localhost:3001/stats
```

### Real-time Logs

The server provides real-time console logging for monitoring:

```
🔌 Connecting to ESP8266 at ws://192.168.1.100:81...
✅ Connected to ESP8266 at ws://192.168.1.100:81
📱 React Native app connected: abc123 from 127.0.0.1
📨 Command from React Native app abc123: toggle_led
📤 Command sent to ESP8266: toggle_led
📨 Message from ESP8266: command_response
📡 Broadcasted ESP8266 data to 1 clients
```

## 🔐 Security Considerations

- **Local Network**: Designed for local network use
- **No Authentication**: Basic proxy server without authentication
- **Input Validation**: Validates command format before forwarding
- **Error Isolation**: Prevents client errors from affecting ESP8266

## 🎯 Benefits

1. **Enhanced Debugging**: REST API for testing commands
2. **Multiple Clients**: Support for multiple React Native apps
3. **Better Reliability**: Automatic reconnection and error handling
4. **Logging**: Detailed logging for troubleshooting
5. **Statistics**: Monitor connections and message flow
6. **Hot Reload**: Development mode with auto-restart
7. **Type Safety**: Full TypeScript implementation

The proxy server provides all the benefits of a modern Node.js server while maintaining perfect compatibility with your existing ESP8266 hardware and React Native app!
