import crypto from "node:crypto";
import path from "node:path";

import { toNodeHandler } from "@hot-updater/server/node";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";

import { config } from "./config";
import { closeDatabase, hotUpdater, runMigrations } from "./hotUpdater";
import { StorageService } from "./storage";

const storage = new StorageService(config.storageDir, config.publicUrl);

const app = express();
app.use(express.json({ limit: "10mb" }));

// The @hot-updater/standalone STORAGE plugin posts JSON to /getDownloadUrl,
// /delete and /readText WITHOUT a Content-Type header, so the default
// express.json() skips them. This parser ignores content-type; applied
// per-route to those endpoints only (never to multipart /upload).
const jsonAnyType = express.json({ limit: "10mb", type: () => true });

class BadRequestError extends Error {}

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

const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      if (err instanceof BadRequestError) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error("Handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  };

// ----------------------------------------------------------------------------
// Diagnostics
// ----------------------------------------------------------------------------

app.get("/health", (_req, res) => res.json({ ok: true }));

// ----------------------------------------------------------------------------
// Bundle file downloads (PUBLIC) — devices fetch bundle + assets here
// ----------------------------------------------------------------------------

app.use("/files", express.static(config.storageDir, { fallthrough: false }));

// ----------------------------------------------------------------------------
// Storage plugin endpoints (AUTH) — called by @hot-updater/standalone storage
// ----------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    const key = req.body?.key;
    if (!file) throw new BadRequestError("Missing 'file'");
    if (!key || typeof key !== "string") throw new BadRequestError("Missing 'key'");
    // The standalone storage plugin sends `key` as the destination DIRECTORY
    // and the actual filename as the multipart file name (e.g. the content
    // hash). Store at <key>/<filename> so it matches the download URLs the
    // server derives from the manifest.
    const filename = file.originalname;
    const fullKey = filename ? `${key}/${filename}` : key;
    const storageUri = await storage.save(fullKey, file.buffer);
    res.json({ storageUri });
  }),
);

app.delete(
  "/delete",
  requireAuth,
  jsonAnyType,
  asyncHandler(async (req, res) => {
    const { storageUri } = req.body ?? {};
    if (!storageUri) throw new BadRequestError("Missing 'storageUri'");
    await storage.delete(storageUri);
    res.json({ success: true });
  }),
);

app.post(
  "/readText",
  requireAuth,
  jsonAnyType,
  asyncHandler(async (req, res) => {
    const { storageUri } = req.body ?? {};
    if (!storageUri) throw new BadRequestError("Missing 'storageUri'");
    const text = await storage.readText(storageUri);
    if (text === null) {
      res.status(404).end();
      return;
    }
    res.type("text/plain").send(text);
  }),
);

app.post(
  "/getDownloadUrl",
  requireAuth,
  jsonAnyType,
  asyncHandler(async (req, res) => {
    const { storageUri } = req.body ?? {};
    if (!storageUri) throw new BadRequestError("Missing 'storageUri'");
    // storageUri is already the public download URL.
    res.json({ fileUrl: storageUri });
  }),
);

// ----------------------------------------------------------------------------
// Official Hot Updater handler (update-check + bundle CRUD) under /hot-updater
//   public:  GET /hot-updater/app-version/*, /hot-updater/fingerprint/*, /version
//   bearer:  /hot-updater/api/*  (bundle management, used by the CLI)
// ----------------------------------------------------------------------------

app.use("/hot-updater/api", requireAuth);
app.all("/hot-updater/*", toNodeHandler(hotUpdater));

// ----------------------------------------------------------------------------
// Minimal console (static page; authenticates via token in the browser)
// ----------------------------------------------------------------------------

app.use("/", express.static(path.join(__dirname, "..", "public")));

async function main() {
  await runMigrations();
  app.listen(config.port, () => {
    console.log(`bellissimo-hot-update listening on :${config.port}`);
    console.log(`Public URL:  ${config.publicUrl}`);
    console.log(`Base path:   ${config.basePath}`);
    console.log(`Data dir:    ${config.dataDir}`);
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
