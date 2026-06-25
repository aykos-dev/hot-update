import { createHotUpdater } from "@hot-updater/server";
import { kyselyAdapter } from "@hot-updater/server/adapters/kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { config } from "./config";

const pool = new Pool({ connectionString: config.databaseUrl });

export const kysely = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool }),
});

// The official Hot Updater server: implements the v0.32 manifest-based
// update-check protocol (manifestUrl + server-computed changedAssets) plus the
// bundle-management CRUD used by the standaloneRepository CLI plugin.
//
// storages: [] — our storageUris are already public HTTP(S) URLs (served by
// this app's /files), so the built-in HTTP resolver returns them directly and
// reads manifests over HTTP. No cloud storage plugin needed.
export const hotUpdater = createHotUpdater({
  database: kyselyAdapter({ db: kysely, provider: "postgresql" }),
  storages: [],
  basePath: config.basePath,
  routes: {
    updateCheck: true,
    bundles: true,
  },
});

export async function runMigrations() {
  const migrator = hotUpdater.createMigrator();
  const result = await migrator.migrateToLatest({
    mode: "from-schema",
    updateSettings: true,
  });
  const operations = (result as { operations?: unknown[] }).operations;
  if (operations && operations.length > 0) {
    await result.execute();
    const version = await migrator.getVersion();
    console.log(`[hot-updater] migrated DB schema to ${version}`);
  } else {
    console.log("[hot-updater] DB schema already up to date");
  }
}

export async function closeDatabase() {
  await kysely.destroy();
}
