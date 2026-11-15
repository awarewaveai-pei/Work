/**
 * Original file kept next to a My Designs preview image (POST /api/tools/designs `sourceUpload`): a .vectorcraft, .svg or .psd.
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
 * Photoshop document (.psd / .psb): what PhotoCraft web saves interactively (upstream crates/ui-egui/src/app/files.rs:236-245).
 * Header = "8BPS", u16 BE version (1 = PSD, 2 = PSB), 6 reserved zero bytes; 26 bytes minimum.
 */
export function isPsdFile(buf: Buffer): boolean {
  if (buf.length < 26 || buf.readUInt32BE(0) !== 0x38425053) return false; // "8BPS"
  const version = buf.readUInt16BE(4);
  return (version === 1 || version === 2) && buf.readUIntBE(6, 6) === 0;
}

/** extension -> content sniffer. The ONE place the accepted source formats are listed: SOURCE_EXTS, the error text and
 *  the source_key pattern below are all derived from it. */
const SOURCE_SNIFFERS = {
  ".vectorcraft": isNativeFile,
  ".svg": isSvgFile,
  ".psd": isPsdFile,
} as const satisfies Record<string, (buf: Buffer) => boolean>;
export type SourceExt = keyof typeof SOURCE_SNIFFERS;
export const SOURCE_EXTS = Object.keys(SOURCE_SNIFFERS) as readonly SourceExt[];
/** Uploaded as this, never as image/svg+xml or text/html: no origin may run a stored file as a document. */
export const SOURCE_CONTENT_TYPE = "application/octet-stream";

/** A file name as stored in metadata.source_name (last path segment, no control characters, <= 160) + its accepted ext. */
export function cleanSourceName(name: unknown): { name: string; ext: SourceExt } | null {
  if (typeof name !== "string") return null;
  const base = name.split(/[\\/]/).pop()!.trim();
  const ext = SOURCE_EXTS.find((e) => base.toLowerCase().endsWith(e));
  if (!ext || base.length > 160 || /[\u0000-\u001f]/.test(base)) return null;
  return { name: base, ext };
}

/** The bytes really are a file of this kind (the label never decides what the bucket hosts). */
export function sourceBytesMatch(ext: SourceExt, buffer: Buffer): boolean {
  return buffer.length > 0 && SOURCE_SNIFFERS[ext](buffer);
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
