import { readFileSync } from "node:fs";
import path from "node:path";

/** The running server's Next.js build id (.next/BUILD_ID), or null when it cannot be read (dev server, tests). */
export function currentBuildId(): string | null {
  try {
    return readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
