/**
 * File storage abstraction.
 *
 * Default provider: private local disk. Files are written under
 * STORAGE_LOCAL_DIR (default ./.data/uploads, git-ignored) — never
 * under public/, so nothing is reachable by URL. Every file is served
 * only through an API route that checks who is asking (see e.g.
 * app/api/lawyer/documents and app/api/lawyers/[id]/photo).
 *
 * For multi-instance or serverless deployments, implement an S3 /
 * Supabase Storage adapter against this same interface — nothing else
 * in the app needs to change. On Docker, mount a volume at the storage
 * directory so uploads survive container restarts.
 */

import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export interface StorageProvider {
  /** Stores the bytes and returns the key to save in the database. */
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Returns the bytes, or null if no such file exists. */
  read(key: string): Promise<Buffer | null>;
  getSignedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key).slice(0, 80)}`);
    this.name = "InvalidStorageKeyError";
  }
}

/**
 * Keys are relative, slash-separated paths. Anything that could escape
 * the storage root — "..", absolute paths, drive letters, backslashes,
 * NUL — is rejected before it gets anywhere near the filesystem.
 */
export function assertSafeKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > 300 ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    /^[a-zA-Z]:/.test(key) ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new InvalidStorageKeyError(key);
  }
}

export class LocalDiskStorageProvider implements StorageProvider {
  readonly root: string;

  constructor(root = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), ".data", "uploads")) {
    this.root = path.resolve(root);
  }

  /** Resolves a key inside the root, refusing anything that lands outside it. */
  pathFor(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(this.root + path.sep)) throw new InvalidStorageKeyError(key);
    return full;
  }

  async upload(key: string, data: Buffer): Promise<string> {
    const full = this.pathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    // Write-then-rename: a reader never sees a half-written file.
    const tmp = `${full}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, full);
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    // Local files have no public URL by design; callers serve them
    // through an authorised API route instead.
    assertSafeKey(key);
    return `/local-storage/${key}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  // Future: if (provider === "s3") cached = new S3StorageProvider();
  if (provider !== "local") {
    console.warn(`[storage] STORAGE_PROVIDER="${provider}" is not implemented — using local disk.`);
  }
  cached = new LocalDiskStorageProvider();
  return cached;
}
