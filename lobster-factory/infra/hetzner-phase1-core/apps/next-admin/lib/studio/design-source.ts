/**
 * Original file kept next to a My Designs preview image (POST /api/tools/designs `sourceFile`): a .vectorcraft, .svg or .pcraft.
 * Stored as its own R2 object; the media_assets row keeps only metadata.source_key / source_name / source_bytes (no schema change).
 * The extension is a label, the bytes are checked (same rule as the image path in route.ts: a label never decides what the bucket hosts).
 */
// format/src/lib.rs:1-30 of storytold/vectorcraft: UTF-8 JSON (gzip when compressed); v4 appends raw blob bytes after the JSON, so the
// whole file is not always valid JSON -> the check is the leading `{"format":"vectorcraft"|"drawcraft"` (the writer emits `format` first).
const NATIVE_HEAD = /^\s*\{\s*"format"\s*:\s*"(?:vectorcraft|drawcraft)"/;
const SVG_PROLOG = /^(?:\s+|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i;

export function isNativeFile(buf: Buffer): boolean {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return true;
  return NATIVE_HEAD.test(buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, ""));
}

export function isSvgFile(buf: Buffer): boolean {
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const rest = text.slice(SVG_PROLOG.exec(text)?.[0].length ?? 0);
  return /^<svg[\s>/]/i.test(rest);
}

/**
 * PhotoCraft project (.pcraft, storytold/photocraft book/src/formats/pcraft.md): a ZIP with a root `manifest.json`.
 * Checked on the ZIP central directory (the authoritative entry list), not by scanning for the name inside the data.
 */
export function isPcraftFile(buf: Buffer): boolean {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return false; // local file header magic, bytes 50 4B 03 04
  const eocdFloor = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= eocdFloor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return false;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return false;
    const nameLen = buf.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (next > buf.length) return false;
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === "manifest.json") {
      // the entry must lead to a real local file header with the same name (a bare central-directory record is not a file)
      const lh = buf.readUInt32LE(p + 42);
      return lh + 30 + nameLen <= buf.length && buf.readUInt32LE(lh) === 0x04034b50 && buf.readUInt16LE(lh + 26) === nameLen
        && buf.toString("utf8", lh + 30, lh + 30 + nameLen) === "manifest.json";
    }
    p = next;
  }
  return false;
}

/** extension -> content sniffer. The ONE place the accepted source formats are listed: SOURCE_EXTS, the error text and
 *  the source_key pattern below are all derived from it. */
const SOURCE_SNIFFERS = {
  ".vectorcraft": isNativeFile,
  ".svg": isSvgFile,
  ".pcraft": isPcraftFile,
} as const satisfies Record<string, (buf: Buffer) => boolean>;
export type SourceExt = keyof typeof SOURCE_SNIFFERS;
export const SOURCE_EXTS = Object.keys(SOURCE_SNIFFERS) as readonly SourceExt[];
/** Uploaded as this, never as image/svg+xml or text/html: no origin may run a stored file as a document. */
export const SOURCE_CONTENT_TYPE = "application/octet-stream";

export type ParsedSource =
  | { ok: true; name: string; ext: SourceExt; buffer: Buffer }
  | { ok: false; status: 400 | 413; error: string };

export function parseDesignSource(raw: unknown, maxBytes: number): ParsedSource {
  const bad = (error: string, status: 400 | 413 = 400): ParsedSource => ({ ok: false, status, error });
  if (!raw || typeof raw !== "object") return bad("source must be { name, data }");
  const { name, data } = raw as { name?: unknown; data?: unknown };
  if (typeof name !== "string" || typeof data !== "string" || !data) return bad("source must be { name: string, data: base64 }");
  const base = name.split(/[\\/]/).pop()!.trim();
  const ext = SOURCE_EXTS.find((e) => base.toLowerCase().endsWith(e));
  if (!ext || base.length > 160 || /[\u0000-\u001f]/.test(base)) return bad(`source file must be ${SOURCE_EXTS.slice(0, -1).join(", ")} or ${SOURCE_EXTS[SOURCE_EXTS.length - 1]}`);
  if (data.length > Math.ceil((maxBytes * 4) / 3) + 8) return bad("source too large (20 MB limit)", 413);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return bad("source data must be base64");
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) return bad("source is empty");
  if (buffer.length > maxBytes) return bad("source too large (20 MB limit)", 413);
  const ok = SOURCE_SNIFFERS[ext](buffer);
  if (!ok) return bad(`source content is not a ${ext} file`);
  return { ok: true, name: base, ext, buffer };
}

/** designs/YYYY-MM/<uuid>.png -> designs/YYYY-MM/<uuid>.<ext> (same prefix and id as the preview). */
export function sourceKeyFor(imageKey: string, ext: SourceExt): string {
  return imageKey.replace(/\.[^./]+$/, "") + ext;
}

const SOURCE_KEY = new RegExp(String.raw`^designs/\d{4}-\d{2}/[0-9a-f-]{36}\.(?:` + SOURCE_EXTS.map((e) => e.slice(1)).join("|") + ")$");

/** Only keys this module mints are ever read from metadata (a row is data, not a path). */
export function sourceKeyFromMetadata(meta: unknown): string | null {
  const k = meta && typeof meta === "object" ? (meta as Record<string, unknown>).source_key : null;
  return typeof k === "string" && SOURCE_KEY.test(k) ? k : null;
}

/** list rows -> same rows plus source_url where a source exists. */
export function withSourceUrls(rows: Record<string, unknown>[], publicBase: () => string): Record<string, unknown>[] {
  return rows.map((r) => {
    const key = sourceKeyFromMetadata(r.metadata);
    return key ? { ...r, source_url: `${publicBase()}/${key}` } : r;
  });
}
