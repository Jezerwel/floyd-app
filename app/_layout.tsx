import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { ESP8266Provider } from "@/hooks/useESP8266Context";
import { useMountEffect } from "@/hooks/useMountEffect";

SplashScreen.preventAutoHideAsync();

function SplashHider() {
  useMountEffect(() => {
    SplashScreen.hideAsync();
  });

  return null;
}

function useStoredChipId() {
  const [state, setState] = useState<{ loading: boolean; chipId: string | null }>({
    loading: true,
    chipId: null,
  });

  useMountEffect(() => {
    let active = true;

    AsyncStorage.getItem("floydChipId")
      .then((chipId) => {
        if (active) {
          setState({ loading: false, chipId });
        }
      })
      .catch((error) => {
        console.error("Failed to load stored Floyd chip ID:", error);
        if (active) {
          setState({ loading: false, chipId: null });
        }
      });

    return () => {
      active = false;
    };
  });

  return state;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const storedDevice = useStoredChipId();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded || storedDevice.loading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SplashHider />
      <ESP8266Provider initialChipId={storedDevice.chipId}>
        <ThemeProvider
          value={colorScheme === "light" ? DefaultTheme : DarkTheme}
        >
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ESP8266Provider>
    </GestureHandlerRootView>
  );
}
