import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import "../global.css";

import { useColorScheme } from "@/hooks/useColorScheme";
import { ESP8266Provider } from "@/hooks/useESP8266Context";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded, fontError] = useFonts({
    SpaceMono_400Regular: require("../assets/fonts/SpaceMono-Regular.ttf"),
    PlayfairDisplay_700Bold: require("../assets/fonts/PlayfairDisplay-Bold.ttf"),
    DMSans_400Regular: require("../assets/fonts/DMSans-Regular.ttf"),
    DMSans_500Medium: require("../assets/fonts/DMSans-Medium.ttf"),
    DMSans_700Bold: require("../assets/fonts/DMSans-Bold.ttf"),
  });

  useEffect(() => {
    if (loaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [loaded, fontError]);

  if (!loaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ESP8266Provider>
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
