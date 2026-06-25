// =============================================================================
// React Native app entry integration (place in your APP repo, e.g. App.tsx).
//
// `source` is the update-check base URL = <server public url> + "/api".
// The update-check endpoint is PUBLIC, so no auth header is needed here.
// =============================================================================

import { HotUpdater } from "@hot-updater/react-native";
import React from "react";
import { Text, View } from "react-native";

function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Bellissimo</Text>
    </View>
  );
}

export default HotUpdater.wrap({
  // e.g. "https://updates.bellissimo.uz/api"
  source: "https://updates.bellissimo.uz/api",
  // "production" by default. Use channels like "staging"/"dev" to test safely.
  // channel: "production",

  // Optional: render while a forced/required update downloads.
  // fallbackComponent: ({ progress }) => (
  //   <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
  //     <Text>Updating… {Math.round(progress * 100)}%</Text>
  //   </View>
  // ),
})(App);
