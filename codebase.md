# Floyd Fish Feeder: Codebase Documentation

This document provides a detailed breakdown of the Floyd Fish Feeder application's codebase. The system consists of a React Native mobile application for user interaction and an ESP8266-based firmware that controls the physical fish feeder.

## 1. High-Level Architecture

The application follows a client-server model operating on a local network.

- **React Native App (Client):** A cross-platform mobile application built with Expo. It provides the user interface for monitoring sensor data, controlling the feeder, and viewing historical data. It communicates with the ESP8266 via a WebSocket connection.
- **ESP8266 Firmware (Server):** An Arduino program running on an ESP8266 microcontroller. It hosts a WebSocket server, reads data from connected sensors (temperature, distance), and controls the motor for dispensing food.
- **Express Server (Alternative Server):** A Node.js server that can be used in place of the ESP8266 for development and testing. It simulates the ESP8266's behavior and provides an identical WebSocket API, along with a REST API for easier debugging.

## 2. Directory and File Structure

### Root Directory

- `.gitignore`: Specifies files and directories that Git should ignore.
- `app.json`: Expo configuration file. Contains settings like the app's name, version, icon, and splash screen.
- `bugs.md`: A markdown file for tracking known bugs and issues.
- `codebase.md`: (This file) Documentation of the project structure.
- `eas.json`: Configuration for Expo Application Services (EAS), used for building and submitting the app.
- `eslint.config.js`: Configuration for ESLint, a tool for identifying and reporting on patterns in JavaScript.
- `ESP8266_Setup_Guide.md`: A guide for setting up the ESP8266 hardware.
- `ESP8266_WebSocket_Server.ino`: The Arduino firmware for the ESP8266 microcontroller. This is the heart of the fish feeder's hardware control.
- `package.json`: Defines the project's dependencies, scripts, and metadata.
- `package-lock.json`: Records the exact versions of the project's dependencies.
- `prompt.md`: A file likely containing prompts or instructions for an AI assistant.
- `README.md`: General information about the project.
- `tsconfig.json`: TypeScript compiler configuration.

### `app/`

This directory contains the application's screens and routing logic, managed by Expo Router.

- `_layout.tsx`: The root layout for the entire application. It sets up the main providers, like the theme and ESP8266 context.
- `+not-found.tsx`: A screen that is displayed when a route is not found.
- `(tabs)/`: A directory that defines a tab-based navigation layout.
  - `_layout.tsx`: The layout for the tab navigator, defining the tabs and their appearance.
  - `controls.tsx`: The "Controls" screen, where the user can manually dispense food and interact with the feeder.
  - `history.tsx`: The "History" screen, which displays historical data from the feeder.
  - `index.tsx`: The main "Dashboard" screen, showing real-time sensor data.

### `assets/`

Contains static assets used by the application.

- `fonts/`: Font files for the app.
- `images/`: Image files, including the app icon, splash screen, and logos.

### `components/`

A collection of reusable React components.

- `Collapsible.tsx`: A component that can expand and collapse to show or hide content.
- `ESP8266Connection.tsx`: A component that manages the connection to the ESP8266, including entering the IP address.
- `ExternalLink.tsx`: A component for opening links in the device's browser.
- `HapticTab.tsx`: A custom tab component that provides haptic feedback.
- `HelloWave.tsx`: An animated wave emoji component.
- `ParallaxScrollView.tsx`: A scroll view with a parallax effect for the header.
- `ThemedText.tsx`: A custom `Text` component that respects the application's theme.
- `ThemedView.tsx`: A custom `View` component that respects the application's theme.
- `ui/`: A subdirectory for more complex, specialized UI components.
  - `AlertItem.tsx`: A component for displaying a single alert.
  - `BatteryLevel.tsx`: A component to visualize the battery level.
  - `CircularProgress.tsx`: A circular progress bar component.
  - `CustomSlider.tsx`: A custom slider component.
  - `DistanceSensor.tsx`: A component to display the distance sensor readings.
  - `IconSymbol.ios.tsx` & `IconSymbol.tsx`: Components for displaying icons, with a platform-specific version for iOS.
  - `PaddleControl.tsx`: A component for controlling the feeder's paddle.
  - `StatCard.tsx`: A card component for displaying a single statistic.
  - `TabBarBackground.ios.tsx` & `TabBarBackground.tsx`: Components for the tab bar background, with a platform-specific version for iOS.
  - `TabButton.tsx`: A custom button for the tab bar.
  - `VerticalSlider.tsx`: A vertical slider component.

### `constants/`

- `Colors.ts`: Defines the color palette used throughout the application for both light and dark themes.

### `hooks/`

Custom React hooks that encapsulate business logic and state management.

- `useAlerts.ts`: A hook for managing and processing alerts from the feeder.
- `useColorScheme.ts`: A hook to get the current color scheme (light/dark).
- `useColorScheme.web.ts`: A web-specific version of `useColorScheme`.
- `useESP8266Context.tsx`: A hook that provides access to the ESP8266 context, including the WebSocket connection and sensor data.
- `useThemeColor.ts`: A hook for getting a color from the theme based on the current color scheme.
- `useWebSocket.ts`: A generic hook for managing a WebSocket connection.

### `scripts/`

- `reset-project.js`: A script to reset the project to a clean state.

### `server/`

This directory contains a Node.js Express server that acts as a proxy between the React Native application and the ESP8266 hardware. This proxy is essential for development and debugging, as it allows the app to communicate with the hardware without requiring a direct connection.

- `package.json`: Defines the server's dependencies (`express`, `ws`, `cors`) and development scripts (`dev`, `build`, `start`).
- `tsconfig.json`: TypeScript compiler configuration for the server.
- `nodemon.json`: Configuration for `nodemon`, which automatically restarts the server during development when file changes are detected.
- `src/`: Contains the server's source code.
  - `server.ts`: The main entry point for the proxy server. It initializes the Express app, creates an HTTP server, and sets up the WebSocket server. It also defines REST API endpoints for managing the ESP8266 connection and monitoring the server's status.
  - `types/index.ts`: Contains all TypeScript interfaces and type definitions for the server, defining the shape of WebSocket messages, device state, and configuration.
  - `services/`: Contains the core logic for the proxy server.
    - `esp8266Client.ts`: A WebSocket client that connects to the ESP8266 hardware. It manages the connection, sends commands, and receives data from the ESP8266.
  - `websocket/`: Contains the WebSocket handling logic.
    - `proxyHandlers.ts`: Manages all WebSocket communication between the React Native app and the ESP8266. It handles new client connections, forwards commands to the ESP8266, and relays responses back to the clients.