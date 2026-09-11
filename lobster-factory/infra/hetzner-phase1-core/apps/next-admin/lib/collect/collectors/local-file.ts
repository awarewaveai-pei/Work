// collect/local-file — documents that already exist on this machine.
//
// The gap this fills was written down and then never assigned to a stage: ADR 011's asset inventory
// records the meeting-transcription pipeline as "a source for the Corpus — could be a collect block
// (local files)", and none of C0 through C6 claimed it. The transcripts already exist, on this
// machine, and there has been no path from them into the knowledge base.
//
// No network, so no SSRF gate, no robots, no rate limit — and therefore a DIFFERENT boundary is
// needed, because "read any path this process can reach" includes .env, the Supabase service key
// and every customer's data. The root is configured, every path is resolved and checked to be
// inside it, and symbolic links are resolved BEFORE the check (a link inside the root pointing at
// /etc is the oldest trick there is).

import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";

/** Extensions this block will read. Everything else is somebody else's job. */
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".vtt", ".srt", ".csv", ".json"]);

export const MAX_FILE_BYTES = 5_000_000;
export const MAX_FILES_PER_RUN = 500;

/**
 * The only directories this block may read from, as an allow-list.
 *
 * COLLECT_LOCAL_ROOTS is a path-separator-joined list. Unset ⇒ the block reports itself as
 * unavailable rather than defaulting to something convenient: a default root here would be a
 * file-read primitive with a default value.
 */
export function configuredRoots(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.COLLECT_LOCAL_ROOTS;
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));
}

/**
 * Resolve a path and prove it is inside an allowed root.
 *
 * `realpath` first: a symlink inside the root that points outside it would otherwise pass a string
 * comparison and then read whatever it likes.
 */
export async function resolveInsideRoot(target: string, roots: string[]): Promise<string> {
  if (!roots.length) throw Object.assign(new Error("local_roots_not_configured"), { status: 501 });
  let resolved: string;
  try {
    resolved = await realpath(path.resolve(target));
  } catch {
    throw Object.assign(new Error(`local_path_unreadable:${target}`), { status: 404 });
  }
  for (const root of roots) {
    let realRoot: string;
    try {
      realRoot = await realpath(root);
    } catch {
      continue;
    }
    const rel = path.relative(realRoot, resolved);
    // Inside means: not the empty-string escape, no leading "..", and not an absolute path.
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return resolved;
  }
  throw Object.assign(new Error("local_path_outside_root"), { status: 403 });
}

/** WebVTT / SRT to plain speech, because timestamps are not content. */
export function captionsToText(raw: string): string {
  return raw
    .replace(/^WEBVTT.*$/m, "")
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/^\d+$/.test(l)) return false; // SRT sequence numbers
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->/.test(l)) return false; // timing lines
      if (/^(NOTE|STYLE|REGION)\b/.test(l)) return false;
      return true;
    })
    .map((l) => l.replace(/<[^>]+>/g, "").trim()) // inline caption markup
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFor(filePath: string, text: string): string {
  const heading = /^#\s+(.+)$/m.exec(text);
  if (heading) return heading[1].trim().slice(0, 300);
  return path.basename(filePath, path.extname(filePath)).slice(0, 300);
}

async function listFiles(root: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (out.length >= limit) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name.startsWith(".")) continue; // dot-files are configuration, not documents
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
    }
  };
  await walk(root);
  return out;
}

export const localFileCollector: CollectBlock = {
  id: "collect/local-file",
  title: "本機檔案／會議逐字稿",
  icon: "📁",

  describe: {
    kind: "file",
    summary: "把這台機器上的文字檔（含會議逐字稿 .vtt/.srt）收進知識庫。只讀被允許的目錄。",
    entry: "path",
    requires: ["COLLECT_LOCAL_ROOTS"],
    options: [
      {
        key: "recursive",
        label: "含子資料夾",
        type: "boolean",
        default: true,
      },
      {
        key: "maxFiles",
        label: "單次最多幾個檔",
        type: "number",
        default: 100,
      },
    ],
  },

  match(t: Target): number {
    return t.uri.startsWith("file:") ? 3 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const roots = configuredRoots();
    // fileURLToPath, never string surgery: a Windows path pasted after "file://" makes the drive
    // letter look like a host, and `new URL()` then rejects the whole thing. The seed was dropped
    // before the crawl even started and the run reported a clean zero — no error, no document.
    const resolved = await resolveInsideRoot(fileURLToPath(t.uri), roots);

    const info = await stat(resolved);
    if (info.isDirectory()) {
      const limit = Math.min(Number(t.meta?.maxFiles ?? 100) || 100, MAX_FILES_PER_RUN);
      const files = await listFiles(resolved, limit);
      ctx.log(`local-file ${resolved}: ${files.length} file(s)`);
      // A folder is a list of targets, exactly like a sitemap is: one file per document keeps the
      // budget, the quality gate and the per-document versioning all working as they already do.
      return {
        docs: [],
        discovered: files.map((f) => {
          const href = pathToFileURL(f).href;
          return { uri: href, canonicalUri: href, scope: t.scope, tier: 0, depth: t.depth + 1 };
        }),
      };
    }

    if (info.size > MAX_FILE_BYTES) {
      throw Object.assign(new Error(`local_file_too_large:${info.size}`), { status: 413 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const buffer = await readFile(resolved);
    const rawText = buffer.toString("utf8");
    const text = ext === ".vtt" || ext === ".srt" ? captionsToText(rawText) : rawText.trim();

    return {
      docs: [
        {
          uri: pathToFileURL(resolved).href,
          // The absolute path IS the identity: re-reading the same file must be a new VERSION of the
          // same document, not a second document.
          canonicalUrl: pathToFileURL(resolved).href,
          contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
          mime: ext === ".md" || ext === ".markdown" ? "text/markdown" : "text/plain",
          title: titleFor(resolved, text),
          author: null,
          contentType: ext === ".vtt" || ext === ".srt" ? "transcript" : "document",
          text,
          raw: { bytes: new Uint8Array(buffer), mime: "text/plain" },
          fetchedAt: new Date().toISOString(),
          // The file's own modification time is the closest thing to "when this became true".
          publishedAt: info.mtime.toISOString(),
          collector: "collect/local-file",
          tenantRef: ctx.tenantRef,
          provenance: { ...COLLECTED_PROVENANCE },
          meta: { bytes: info.size, extension: ext },
        },
      ],
      discovered: [],
    };
  },
};

registerCollector(localFileCollector);
