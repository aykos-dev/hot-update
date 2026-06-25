import { s3Storage } from "@hot-updater/aws";
import { createHotUpdater } from "@hot-updater/server";
import { kyselyAdapter } from "@hot-updater/server/adapters/kysely";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import { config } from "./config";

const pool = new Pool({ connectionString: config.databaseUrl });

export const kysely = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool }),
});

export const hotUpdater = createHotUpdater({
  database: kyselyAdapter({ db: kysely, provider: "postgresql" }),
  storages: [
    s3Storage({
      region: "auto",
      endpoint: config.r2.endpoint,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
      bucketName: config.r2.bucketName,
    }),
  ],
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
