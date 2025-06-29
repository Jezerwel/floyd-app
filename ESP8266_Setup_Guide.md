# ESP8266 WebSocket Setup Guide - DS18B20 Temperature Sensor

This guide will help you set up WebSocket communication between your React Native app and ESP8266 microcontroller using a DS18B20 waterproof temperature sensor.

## 📋 Phase 1: ESP8266 Hardware Setup

### Required Components

- **ESP8266 Development Board** (NodeMCU, Wemos D1 Mini, or similar)
- **DS18B20 Temperature Sensor Module** (Waterproof Digital Sensor Cable with Stainless Probe)
- **LED** (any color, optional for testing)
- **Relay Module** (5V or 3.3V compatible, optional)
- **Resistors**: 4.7kΩ (pull-up resistor for DS18B20), 220Ω (for LED)
- **Breadboard and Jumper Wires**

### Wiring Diagram

```
ESP8266 (NodeMCU) Pin Connections:
┌─────────────────────────────────────┐
│ Component        │ ESP8266 Pin      │
├─────────────────────────────────────┤
│ DS18B20 VCC (Red)│ 3.3V             │
│ DS18B20 Data (Yel)│ D4 (via 4.7kΩ)  │
│ DS18B20 GND (Blk)│ GND              │
│ 4.7kΩ Resistor   │ D4 to 3.3V       │
├─────────────────────────────────────┤
│ LED Anode (+)    │ D1 (via 220Ω)    │
│ LED Cathode (-)  │ GND              │
├─────────────────────────────────────┤
│ Relay VCC        │ 3.3V or 5V       │
│ Relay Signal     │ D2               │
│ Relay GND        │ GND              │
└─────────────────────────────────────┘
```

### DS18B20 Wiring Details

The DS18B20 waterproof sensor typically has 3 wires:

- **Red Wire**: VCC (3.3V power)
- **Yellow/White Wire**: Data signal (connect to D4 with 4.7kΩ pull-up resistor)
- **Black Wire**: GND (ground)

**Important**: The 4.7kΩ resistor must be connected between the data line (D4) and VCC (3.3V) for proper OneWire communication.

## 🔧 Phase 2: Arduino IDE Setup

### 1. Install Arduino IDE

- Download from [arduino.cc](https://www.arduino.cc/en/software)
- Install and launch Arduino IDE

### 2. Configure ESP8266 Board Support

```
1. Open Arduino IDE
2. Go to File → Preferences
3. In "Additional Board Manager URLs", add:
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
4. Go to Tools → Board → Boards Manager
5. Search for "esp8266" and install "ESP8266 by ESP8266 Community"
6. Select your board: Tools → Board → ESP8266 Boards → NodeMCU 1.0
```

### 3. Install Required Libraries

```
Go to Sketch → Include Library → Manage Libraries

Install these libraries:
1. "WebSockets" by Markus Sattler
2. "ArduinoJson" by Benoit Blanchon
3. "OneWire" by Jim Studt
4. "DallasTemperature" by Miles Burton
```

## 💻 Phase 3: ESP8266 Programming

### 1. Upload the WebSocket Server Code

1. Open the `ESP8266_WebSocket_Server.ino` file
2. **IMPORTANT**: Update WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";        // Replace with your WiFi name
   const char* password = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password
   ```
3. Select correct board and port:
   - Tools → Board → NodeMCU 1.0 (ESP-12E Module)
   - Tools → Port → [Select your COM port]
4. Click Upload button
5. Open Serial Monitor (Tools → Serial Monitor, 115200 baud)

### 2. Verify ESP8266 Operation

After uploading, you should see in Serial Monitor:

```
=== ESP8266 WebSocket Server with DS18B20 ===
Found 1 DS18B20 device(s)
DS18B20 temperature sensor initialized successfully
Connecting to WiFi........
WiFi connected!
IP address: 192.168.1.XXX
WebSocket server started on port: 81
Setup complete! Ready for connections.
Connect your app to: ws://192.168.1.XXX:81
```

**Note the IP address** - you'll need it for the app connection!

## 📱 Phase 4: React Native App Setup

### 1. Install Dependencies

The app already includes WebSocket dependencies. Run:

```bash
npm install
```

### 2. Run the App

```bash
# For iOS
npm run ios

# For Android
npm run android

# For Web
npm run web
```

## 🔗 Phase 5: Connecting App to ESP8266

### 1. Same Network Connection

1. Ensure your phone/computer is on the **same WiFi network** as ESP8266
2. Open the app and go to "Controls" tab
3. Enter the ESP8266's IP address and port in the connection form:
   ```
   Example: 192.168.1.100:81
   or: ws://192.168.1.100:81
   ```
4. Tap "Connect"

### 2. Connection Status

- **Green dot**: Successfully connected
- **Yellow dot**: Connecting in progress
- **Red dot**: Connection failed or disconnected

## 🎛️ Phase 6: Available Controls

### Device Controls

- **LED Control**: Toggle built-in or external LED on/off
- **Relay Control**: Control relay for external devices

### Temperature Monitoring

- **DS18B20 Temperature**: Waterproof digital temperature sensor reading (°C)
- **Sensor Status**: Connection status indicator
- **Temperature Status**: Visual indicators (Freezing, Cold, Comfortable, Warm, Hot)

### Advanced Features

- **Auto Refresh**: Automatically update temperature data
- **Custom Intervals**: Set reading frequency (1s, 5s, 10s, 30s)
- **Real-time Updates**: Instant notifications from ESP8266
- **Connection Management**: Auto-reconnect, saved devices

## 🔧 Troubleshooting

### Connection Issues

1. **Cannot connect to ESP8266**:

   - Verify ESP8266 is powered and WiFi connected
   - Check IP address in Serial Monitor
   - Ensure devices are on same network
   - Try direct IP format: `192.168.1.100:81`

2. **WebSocket connection drops**:

   - Check WiFi signal strength
   - Verify power supply to ESP8266
   - Look for interference or network issues

3. **Temperature readings show "--"**:
   - Check DS18B20 wiring connections
   - Verify 4.7kΩ pull-up resistor is connected
   - Check power supply (3.3V)
   - Look for "Found 0 DS18B20 device(s)" in Serial Monitor

### Hardware Issues

1. **DS18B20 not detected**:

   - Verify VCC connection to 3.3V
   - Check data pin connection to D4
   - Ensure 4.7kΩ resistor between D4 and 3.3V
   - Confirm ground connection
   - Test with multimeter for continuity

2. **LED not responding**:

   - Check LED polarity (longer leg = anode/+)
   - Verify 220Ω resistor in series
   - Test with different GPIO pin

3. **Inconsistent temperature readings**:
   - Check for loose connections
   - Ensure proper pull-up resistor value (4.7kΩ)
   - Verify single DS18B20 device on bus
   - Check for electromagnetic interference

### DS18B20 Specific Issues

1. **Sensor reading -127°C or 85°C**:

   - Power supply issue (check 3.3V connection)
   - Missing or incorrect pull-up resistor
   - Damaged sensor

2. **Slow temperature response**:
   - Normal for DS18B20 (750ms conversion time)
   - Thermal mass of waterproof probe
   - Allow time for temperature stabilization

## 🌐 Network Configuration Options

### Option A: Same WiFi Network (Recommended)

- ESP8266 connects to home WiFi
- App connects to same WiFi network
- Direct IP communication

### Option B: ESP8266 Access Point Mode (Advanced)

Modify ESP8266 code to create WiFi hotspot:

```cpp
// Replace WiFi.begin() with:
WiFi.softAP("ESP8266-TempSensor", "password123");
IPAddress myIP = WiFi.softAPIP();
// Connect app to "ESP8266-TempSensor" network
```

## 📊 Communication Protocol

### WebSocket Message Format

All messages use JSON format:

**App to ESP8266**:

```json
{
  "action": "toggle_led",
  "parameters": {},
  "timestamp": 1234567890
}
```

**ESP8266 to App**:

```json
{
  "type": "sensor_data",
  "data": {
    "temperature": 23.5,
    "sensorConnected": true,
    "ledState": true,
    "relayState": false
  },
  "timestamp": 1234567890
}
```

### Supported Actions

- `toggle_led` - Toggle LED on/off
- `toggle_relay` - Toggle relay on/off
- `get_sensors` - Request current temperature data
- `set_sensor_interval` - Change auto-read frequency
- `ping` - Heartbeat/keep-alive

## 🔒 Security Notes

### Basic Security Measures

1. **Change default WiFi credentials** in ESP8266 code
2. **Use strong WiFi passwords**
3. **Keep ESP8266 firmware updated**
4. **Limit network access** if using port forwarding

## 🚀 Next Steps

### Extend Functionality

1. **Multiple DS18B20 sensors**: Connect multiple temperature sensors to same bus
2. **Temperature logging**: Store readings to SD card or cloud
3. **Temperature alerts**: Push notifications for threshold violations
4. **Scheduling**: Time-based automation rules
5. **Data visualization**: Charts and graphs of temperature history

### App Enhancements

1. **Historical data**: Temperature trends over time
2. **Multiple devices**: Control multiple ESP8266 units
3. **Temperature profiles**: Set target temperatures
4. **Export data**: CSV export for analysis

---

## 📞 Support

If you encounter issues:

1. Check Serial Monitor output for ESP8266 errors
2. Verify DS18B20 wiring and pull-up resistor
3. Test with minimal setup (just temperature sensor)
4. Ensure 4.7kΩ resistor is properly connected
5. Check network connectivity

**Happy temperature monitoring! 🌡️**
