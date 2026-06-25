import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (no dependency). Only sets keys that are not already
// present in process.env, so real environment variables always win.
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env"));

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const dataDir = path.resolve(process.env.DATA_DIR ?? "./data");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Public, externally-reachable base URL of THIS server. Used to build the
  // download URLs handed to devices, so it must be reachable from the phone
  // (a domain or LAN IP — not "localhost" when testing on a real device).
  publicUrl: (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  ),
  // Bearer token that protects management + upload routes (CLI deploys).
  authToken: required("HOT_UPDATER_AUTH_TOKEN"),
  // Postgres connection string for bundle metadata.
  databaseUrl: required("DATABASE_URL"),
  // Path prefix the official hot-updater handler is mounted under. The RN
  // client baseURL and the CLI standaloneRepository baseUrl both use this.
  basePath: "/hot-updater",
  dataDir,
  storageDir: path.join(dataDir, "storage"),
};
