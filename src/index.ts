import crypto from "node:crypto";
import path from "node:path";

import { toNodeHandler } from "@hot-updater/server/node";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { config } from "./config";
import { closeDatabase, hotUpdater, runMigrations } from "./hotUpdater";

const app = express();
app.use(express.json({ limit: "10mb" }));

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(token);
  const b = Buffer.from(config.authToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/hot-updater/api", requireAuth);
app.all("/hot-updater/*", toNodeHandler(hotUpdater));

app.use("/", express.static(path.join(__dirname, "..", "public")));

async function main() {
  await runMigrations();
  app.listen(config.port, () => {
    console.log(`bellissimo-hot-update listening on :${config.port}`);
    console.log(`Base path:   ${config.basePath}`);
    console.log(`Storage:     R2 bucket ${config.r2.bucketName}`);
  });
}

const shutdown = async (sig: string) => {
  console.log(`${sig} received, shutting down`);
  try {
    await closeDatabase();
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
