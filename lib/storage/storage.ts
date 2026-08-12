/**
 * File storage abstraction.
 * Default provider is local disk (for demo mode). Swap in
 * an S3 / Cloudinary / Supabase Storage adapter by implementing
 * this same interface — nothing else in the app needs to change.
 */

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  getSignedUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

class LocalStorageProvider implements StorageProvider {
  async upload(key: string, _data: Buffer, _contentType: string): Promise<string> {
    // In a real local setup this would write to a gitignored /uploads dir.
    // Kept as a stub here to avoid unexpected disk writes in this scaffold.
    return `/local-storage/${key}`;
  }
  async getSignedUrl(key: string): Promise<string> {
    return `/local-storage/${key}`;
  }
  async delete(_key: string): Promise<void> {
    return;
  }
}

// Placeholder for future S3-compatible provider.
// class S3StorageProvider implements StorageProvider { ... }

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider === "local") return new LocalStorageProvider();
  // Future: return new S3StorageProvider();
  return new LocalStorageProvider();
}
