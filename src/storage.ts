import fs from "node:fs";
import path from "node:path";

// Local-filesystem storage. A bundle is stored at <storageDir>/<key> and is
// publicly downloadable at <publicUrl>/files/<key>. The public HTTP URL is
// used directly as the bundle's `storageUri`, so the update-check endpoint can
// hand it back to the client as `fileUrl` with no extra resolution step.

const FILES_PREFIX = "/files/";

export class StorageService {
  constructor(
    private storageDir: string,
    private publicUrl: string,
  ) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  private safeKey(key: string): string {
    const normalized = path
      .normalize(key)
      .replace(/^(\.\.[/\\])+/, "")
      .replace(/^[/\\]+/, "");
    if (normalized.includes("..")) {
      throw new Error(`Unsafe storage key: ${key}`);
    }
    return normalized;
  }

  private absPath(key: string): string {
    const safe = this.safeKey(key);
    const abs = path.join(this.storageDir, safe);
    const root = path.resolve(this.storageDir);
    if (!path.resolve(abs).startsWith(root)) {
      throw new Error(`Path traversal blocked for key: ${key}`);
    }
    return abs;
  }

  private keyFromStorageUri(storageUri: string): string {
    const idx = storageUri.indexOf(FILES_PREFIX);
    if (idx === -1) {
      throw new Error(`storageUri is not managed by this server: ${storageUri}`);
    }
    return decodeURIComponent(storageUri.slice(idx + FILES_PREFIX.length));
  }

  storageUriForKey(key: string): string {
    const safe = this.safeKey(key);
    const encoded = safe.split("/").map(encodeURIComponent).join("/");
    return `${this.publicUrl.replace(/\/+$/, "")}${FILES_PREFIX}${encoded}`;
  }

  async save(key: string, buffer: Buffer): Promise<string> {
    const abs = this.absPath(key);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, buffer);
    return this.storageUriForKey(key);
  }

  async delete(storageUri: string): Promise<void> {
    const key = this.keyFromStorageUri(storageUri);
    const abs = this.absPath(key);
    await fs.promises.rm(abs, { force: true });
  }

  async readText(storageUri: string): Promise<string | null> {
    const key = this.keyFromStorageUri(storageUri);
    const abs = this.absPath(key);
    try {
      return await fs.promises.readFile(abs, "utf-8");
    } catch {
      return null;
    }
  }
}
