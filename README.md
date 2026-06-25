# bellissimo-hot-update

A **self-hosted, zero-cost** OTA (over-the-air) update server for React Native,
wire-compatible with [`hot-updater`](https://github.com/gronxb/hot-updater).

- **No cloud bills.** Bundles are stored on the server's local disk; metadata
  lives in a local **SQLite** file. No S3, no Lambda, no Cloudflare, no Supabase.
- **Drop-in client.** Your app uses the official `@hot-updater/react-native`.
- **Drop-in deploys.** You deploy with the official `hot-updater` CLI configured
  with the `@hot-updater/standalone` storage + repository plugins.

This server faithfully reimplements the three HTTP contracts hot-updater needs:
update-check (app ↔ server), bundle management, and file storage.

---

## How it works

```
                       ┌─────────────────────────────────────────┐
   npx hot-updater     │            bellissimo-hot-update          │
   deploy  ──────────► │  POST /upload            (bundle file)    │
   (CLI, @hot-updater/ │  POST /api/bundles       (metadata)       │
    standalone)        │                                           │
                       │  Express + SQLite + local file storage    │
   RN app   ──────────►│  GET  /api/app-version/... (update check) │
   (@hot-updater/      │  GET  /files/...           (download)     │
    react-native)      └─────────────────────────────────────────┘
```

- **Storage**: uploaded bundles are written to `DATA_DIR/storage/<key>` and
  served publicly at `PUBLIC_URL/files/<key>`. That public URL is stored as the
  bundle's `storageUri` and handed straight to the device as the download URL.
- **Database**: a single `bundles` table in `DATA_DIR/hot-updater.db`.
- **Matching logic** (which bundle a device should get, semver ranges, rollback,
  cohort/rollout) is ported verbatim from `@hot-updater/js` so behavior matches
  the official hosted setups.

### Endpoints

| Method | Path | Auth | Used by |
| ------ | ---- | ---- | ------- |
| `GET` | `/api/app-version/:platform/:appVersion/:channel/:minBundleId/:bundleId/:cohort?` | public | RN client (appVersion strategy) |
| `GET` | `/api/fingerprint/:platform/:fingerprintHash/:channel/:minBundleId/:bundleId/:cohort?` | public | RN client (fingerprint strategy) |
| `GET` | `/files/*` | public | device bundle download |
| `GET/POST/PATCH/DELETE` | `/api/bundles*` | Bearer | CLI `standaloneRepository` + console |
| `POST` | `/upload`, `DELETE /delete`, `POST /readText`, `POST /getDownloadUrl` | Bearer | CLI `standaloneStorage` |
| `GET` | `/` | console (token entered in browser) | you |
| `GET` | `/version`, `/health` | public | diagnostics |

---

## 1. Run the server

### Option A — Docker (recommended)

```bash
cd bellissimo-hot-update
cp .env.example .env
# edit .env: set a strong HOT_UPDATER_AUTH_TOKEN and the public PUBLIC_URL
export $(grep -v '^#' .env | xargs)   # or rely on docker-compose reading .env
docker compose up -d --build
```

`docker compose` reads `PUBLIC_URL` and `HOT_UPDATER_AUTH_TOKEN` from `.env`.
Data is persisted in the `hot_update_data` volume — that's the only thing to
back up.

### Option B — Node directly

```bash
cd bellissimo-hot-update
npm install
cp .env.example .env   # edit it
npm run dev            # watch mode
# or: npm run build && npm start
```

Generate a token: `openssl rand -hex 32`.

> **`PUBLIC_URL` must be reachable from the phone.** On a real device on your
> LAN use your machine's IP (e.g. `http://192.168.1.50:3000`). In production put
> it behind HTTPS (Caddy/Nginx/Cloudflare Tunnel) — iOS/Android require HTTPS
> download URLs in release builds.

Open `PUBLIC_URL/` in a browser, paste the token, and you get a console listing
bundles with enable/disable, force-update, rollback (disable) and delete.

---

## 2. Wire up the React Native app

Your Expo app (`expo ~52`, `react-native 0.76`) needs the client + CLI plugins.
> OTA only ships JS + assets. Any **native** change (new native dep, SDK bump,
> `app.json` native config) still needs a new store build.

```bash
# in your app repo (e.g. bellissimo-client-app-v2)
npm i @hot-updater/react-native
npm i -D hot-updater @hot-updater/standalone @hot-updater/expo
```

1. Copy [`examples/hot-updater.config.ts`](examples/hot-updater.config.ts) to the
   app root and create `.env.hotupdater`:
   ```
   HOT_UPDATER_BASE_URL=https://updates.bellissimo.uz
   HOT_UPDATER_AUTH_TOKEN=<same token as the server>
   ```
2. Wrap your root component — see [`examples/App.integration.tsx`](examples/App.integration.tsx):
   ```ts
   export default HotUpdater.wrap({ source: "https://updates.bellissimo.uz/api" })(App);
   ```
   Note the **`/api`** suffix on `source` (the management base URL has no suffix).
3. Run the hot-updater Expo config plugin / prebuild as the CLI instructs
   (`npx hot-updater --help`), then build a **release** dev-client / store build.
   OTA does not run in `__DEV__` / Expo Go.

---

## 3. Deploy an update

From the app repo, after a JS change:

```bash
# target the app store version range your build reports, on a channel
npx hot-updater deploy -p ios     -t "1.0.x" -c production
npx hot-updater deploy -p android -t "1.0.x" -c production
```

The CLI bundles + hashes, calls `POST /upload` (file) then `POST /api/bundles`
(metadata) on your server. Launch a release build and it will pull the update on
next check.

**Test safely first** on a non-production channel:
```bash
npx hot-updater deploy -p ios -t "1.0.x" -c staging
```
and run a build wrapped with `HotUpdater.wrap({ source, channel: "staging" })`.

### Rollback
Disable a bad bundle from the console (or `PATCH /api/bundles/:id {"enabled":false}`).
Devices on it will roll back to the previous enabled bundle (or the built-in one).

---

## Production notes

- **HTTPS**: terminate TLS in front of this server. Easiest free option:
  Caddy (auto Let's Encrypt) or a Cloudflare Tunnel. Set `PUBLIC_URL` to the
  HTTPS URL.
- **Backups**: back up the `DATA_DIR` (SQLite DB + `storage/` bundles).
- **Auth**: the token guards deploys/management/console. Bundle files under
  `/files` are intentionally public (devices download them unauthenticated),
  same model as CodePush. Enable hot-updater **bundle signing** in the app
  config if you want integrity guarantees.
- This server keeps a single replica + local disk. That's plenty for OTA, but it
  means no horizontal scaling — fine for a self-hosted, no-cost setup.

## Project layout

```
src/
  index.ts       Express app: all routes + auth
  db.ts          SQLite bundle store + pagination
  storage.ts     local-file storage (upload/delete/readText/download URL)
  updateInfo.ts  update-check matching (ported from @hot-updater/js)
  rollout.ts     cohort/rollout eligibility (ported from @hot-updater/core)
  types.ts       wire types mirrored from @hot-updater/core
  config.ts      env + paths
public/index.html  minimal management console
examples/          config + app integration to copy into your RN app
```
