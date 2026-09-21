// Private-bucket object access for site-watch, over the shared R2 transport (lib/storage/r2.ts).
import { r2DeleteObject, r2GetObject, r2ListObjects, r2PutObject, type R2ListedObject } from "@/lib/storage/r2";
import { siteWatchBucket } from "./config";
import type { ObjectStore } from "./runner";

export interface SiteWatchObjects extends ObjectStore {
  list(prefix: string): Promise<R2ListedObject[] | null>;
  remove(key: string): Promise<boolean>;
}

const IO_TIMEOUT_MS = 30_000;
const MAX_OBJECT_BYTES = 12_000_000;

/** null when R2_SITE_WATCH_BUCKET is unset (C12: never fall back to a public bucket). */
export function createSiteWatchObjects(): SiteWatchObjects | null {
  const bucket = siteWatchBucket();
  if (!bucket) return null;
  return {
    async put(key, body, contentType) {
      const r = await r2PutObject(bucket, key, body, contentType, { timeoutMs: IO_TIMEOUT_MS });
      if ("error" in r) console.warn(`[site-watch] put ${key} failed: ${r.error}`);
      return r.ok;
    },
    async get(key) {
      const r = await r2GetObject(bucket, key, { timeoutMs: IO_TIMEOUT_MS, maxBytes: MAX_OBJECT_BYTES });
      if ("error" in r) {
        if (r.error !== "r2_not_found") console.warn(`[site-watch] get ${key} failed: ${r.error}`);
        return null;
      }
      return r.body;
    },
    async list(prefix) {
      const r = await r2ListObjects(bucket, prefix);
      if ("error" in r) {
        console.warn(`[site-watch] list ${prefix} failed: ${r.error}`);
        return null;
      }
      return r.objects;
    },
    async remove(key) {
      const r = await r2DeleteObject(bucket, key, { timeoutMs: IO_TIMEOUT_MS });
      if ("error" in r) console.warn(`[site-watch] delete ${key} failed: ${r.error}`);
      return r.ok;
    },
  };
}
