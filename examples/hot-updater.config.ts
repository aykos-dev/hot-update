// =============================================================================
// Place this file at the ROOT of your React Native / Expo app
// (e.g. bellissimo-client-app-v2/hot-updater.config.ts), NOT in this server.
//
// It tells the `hot-updater` CLI to push bundles to YOUR self-hosted server
// using the standalone storage + repository plugins (zero cloud cost).
//
// Install in the app:
//   npm i -D hot-updater @hot-updater/standalone @hot-updater/expo
//   # (Expo app) also: npm i @hot-updater/react-native
//
// Then create a .env.hotupdater next to this file:
//   HOT_UPDATER_BASE_URL=https://updates.bellissimo.uz
//   HOT_UPDATER_AUTH_TOKEN=<same token as the server>
// =============================================================================

import { expo } from "@hot-updater/expo";
import { standaloneRepository, standaloneStorage } from "@hot-updater/standalone";
import { config } from "dotenv";
import { defineConfig } from "hot-updater";

config({ path: ".env.hotupdater" });

const baseUrl = process.env.HOT_UPDATER_BASE_URL!.replace(/\/+$/, "");
const authHeaders = {
  Authorization: `Bearer ${process.env.HOT_UPDATER_AUTH_TOKEN}`,
};

export default defineConfig({
  // Expo (SDK 52, RN 0.76) build plugin.
  build: expo(),

  // Bundle files -> POST {baseUrl}/upload, etc.
  storage: standaloneStorage({
    baseUrl,
    commonHeaders: authHeaders,
  }),

  // Bundle metadata -> {baseUrl}/api/bundles*
  database: standaloneRepository({
    baseUrl,
    commonHeaders: authHeaders,
  }),

  // appVersion: target updates by app store version range (e.g. "1.0.x").
  // Switch to "fingerprint" if you prefer native-fingerprint targeting.
  updateStrategy: "appVersion",
});
