import React from "react";
import { Link, Stack } from "expo-router";
import { StyleSheet } from "react-native";

import { Surface } from "@/components/ui/Surface";
import { ThemedText } from "@/components/ui/Text";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <Surface style={styles.container}>
        <ThemedText variant="h1">This screen does not exist.</ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText variant="body" color="#0a7ea4">
            Go to home screen!
          </ThemedText>
        </Link>
      </Surface>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
