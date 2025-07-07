# Bugs and Areas for Improvement

This document outlines potential bugs and areas for improvement in the ESP8266 firmware and the React Native application.

## ESP8266 Firmware (`ESP8266_WebSocket_Server.ino`)

### 1. Hardcoded WiFi Credentials

- **Issue:** The WiFi SSID and password are hardcoded in the firmware.
- **Impact:** This is a security risk and makes it difficult to change the credentials without reflashing the device.
- **Recommendation:** Implement a mechanism to configure the WiFi credentials at runtime, such as a web-based configuration portal or a command-line interface over the serial port.

### 2. Lack of Error Handling for `pulseIn`

- **Issue:** The `readUltrasonicDistance` function uses `pulseIn` to measure the distance, but it does not specify a timeout.
- **Impact:** If the sensor is not working correctly, the `pulseIn` function could block indefinitely, causing the program to hang.
- **Recommendation:** Add a timeout to the `pulseIn` function to prevent it from blocking for too long.

### 3. Noisy Sensor Readings

- **Issue:** The `readUltrasonicDistance` function takes a single reading from the sensor.
- **Impact:** This can be inaccurate due to noise.
- **Recommendation:** Take multiple readings from the sensor and average them to get a more reliable measurement.

### 4. Blocking `delay()` in `loop()`

- **Issue:** The `loop()` function contains a `delay(10)` call.
- **Impact:** While this is a small delay, it is generally not a good practice to use blocking delays in the main loop, as it can affect the responsiveness of the WebSocket server.
- **Recommendation:** Use a non-blocking approach, such as the `millis()` function, to schedule tasks.

### 5. Potential for Integer Overflow in `millis()`

- **Issue:** The code uses `millis()` to track time intervals. Since `millis()` returns an `unsigned long`, it will overflow after approximately 50 days.
- **Impact:** This could cause issues with the timing of sensor readings and heartbeats.
- **Recommendation:** While 50 days is a long time, it's still a potential issue for a long-running device. Use a more robust method for tracking time, such as a real-time clock (RTC) module.

### 6. No Reconnection Logic for WiFi

- **Issue:** The code connects to WiFi in the `setup()` function, but there is no logic to handle disconnections or to attempt to reconnect if the connection is lost.
- **Impact:** If the WiFi connection is lost, the device will not be able to communicate with the app.
- **Recommendation:** Implement a mechanism to detect WiFi disconnections and to attempt to reconnect automatically.

### 7. Stepper Motor Control

- **Issue:** The stepper motor is controlled by the `handleRelayToggle` function.
- **Impact:** This is not ideal, as the relay should only control the power to the motor, not the stepping sequence.
- **Recommendation:** The stepping sequence should be handled by a separate function that is called when the feeder needs to be opened or closed.

### 8. Lack of Comments

- **Issue:** The code is not well-commented.
- **Impact:** This makes it difficult to understand and maintain.
- **Recommendation:** Add comments to the code to explain the purpose of each function and variable.

## React Native Application

### 1. No Error Handling for WebSocket

- **Issue:** The application does not appear to have any error handling for the WebSocket connection.
- **Impact:** If the WebSocket connection fails, the application will not be able to communicate with the ESP8266, and the user will not be notified of the problem.
- **Recommendation:** Implement error handling for the WebSocket connection to detect and handle connection errors.

### 2. No Connection Status Indicator

- **Issue:** The application does not have a connection status indicator.
- **Impact:** The user does not know if the application is connected to the ESP8266.
- **Recommendation:** Add a connection status indicator to the UI to show the user whether the application is connected to the ESP8266.

### 3. No Way to Configure the IP Address

- **Issue:** The IP address of the ESP8266 is likely hardcoded in the application.
- **Impact:** This makes it difficult to connect to the ESP8266 if its IP address changes.
- **Recommendation:** Implement a way for the user to configure the IP address of the ESP8266.

### 4. Outdated Dependencies

- **Issue:** The `package.json` file shows that some of the dependencies are outdated.
- **Impact:** This could lead to security vulnerabilities and other issues.
- **Recommendation:** Update the dependencies to the latest versions.
