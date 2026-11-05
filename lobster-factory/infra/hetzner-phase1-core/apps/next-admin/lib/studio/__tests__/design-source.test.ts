// design-source.ts: one extension -> sniffer table drives the accepted formats (C5.1). .pcraft = real ZIP with a root manifest.json.
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { parseDesignSource, SOURCE_EXTS, sourceKeyFor, sourceKeyFromMetadata, withSourceUrls } from "../design-source";

const MAX = 20 * 1024 * 1024;
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64");
const parse = (name: string, data: Buffer | string) => parseDesignSource({ name, data: b64(data) }, MAX);
const zip = async (entries: Record<string, string>) => {
  const z = new JSZip();
  for (const [n, v] of Object.entries(entries)) z.file(n, v);
  return z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};

describe("SOURCE_EXTS is the single list", () => {
  it("has the three formats; the error text names exactly them", () => {
    expect([...SOURCE_EXTS]).toEqual([".vectorcraft", ".svg", ".pcraft"]);
    const r = parse("a.exe", "x");
    expect(r).toMatchObject({ ok: false, status: 400, error: "source file must be .vectorcraft, .svg or .pcraft" });
  });
});

describe(".pcraft sniffer", () => {
  it("accepts a real ZIP with a root manifest.json (also when the entry is not first)", async () => {
    const r = parse("poster.pcraft", await zip({ "layers/0.png": "x", "manifest.json": '{"version":1}' }));
    expect(r).toMatchObject({ ok: true, name: "poster.pcraft", ext: ".pcraft" });
  });

  it("rejects a ZIP without manifest.json (also a nested one) and a ZIP header with no real ZIP behind it", async () => {
    for (const data of [
      await zip({ "layers/0.png": "x" }),
      await zip({ "sub/manifest.json": "{}" }),
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("manifest.json".repeat(10))]),
      gzipSync(Buffer.from("manifest.json")),
      Buffer.from("manifest.json PK"),
    ]) {
      expect(parse("a.pcraft", data)).toMatchObject({ ok: false, status: 400, error: "source content is not a .pcraft file" });
    }
  });

  it("rejects a manifest.json that exists only as a central-directory record (offset points at no local header)", async () => {
    const real = await zip({ "manifest.json": "{}" });
    const cd = real.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const bad = Buffer.from(real);
    bad.writeUInt32LE(real.length - 1, cd + 42);
    expect(parse("a.pcraft", bad)).toMatchObject({ ok: false });
    expect(parse("a.pcraft", real).ok).toBe(true);
  });

  it("does not let a .pcraft label carry another format's bytes, nor the reverse", async () => {
    const real = await zip({ "manifest.json": "{}" });
    expect(parse("a.pcraft", "<svg xmlns='x'/>").ok).toBe(false);
    expect(parse("a.svg", real).ok).toBe(false);
    expect(parse("a.vectorcraft", real).ok).toBe(false);
  });
});

describe("existing formats unchanged", () => {
  it(".vectorcraft (gzip and JSON head) and .svg still pass; label/bytes mismatch still fails", () => {
    expect(parse("a.vectorcraft", gzipSync(Buffer.from("{}"))).ok).toBe(true);
    expect(parse("a.vectorcraft", '{ "format": "drawcraft", "version": 4 }').ok).toBe(true);
    expect(parse("a.svg", '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>').ok).toBe(true);
    expect(parse("a.vectorcraft", "<svg xmlns='x'/>").ok).toBe(false);
    expect(parse("a.svg", "<html/>").ok).toBe(false);
  });
});

describe("source_key round trip", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  it("mints <preview id>.pcraft and reads it back as source_url", () => {
    const key = sourceKeyFor(`designs/2026-11/${ID}.png`, ".pcraft");
    expect(key).toBe(`designs/2026-11/${ID}.pcraft`);
    expect(sourceKeyFromMetadata({ source_key: key })).toBe(key);
    const [row] = withSourceUrls([{ id: "r", metadata: { source_key: key } }], () => "https://r2.test");
    expect(row.source_url).toBe(`https://r2.test/${key}`);
  });
  it("still reads .vectorcraft/.svg keys and refuses keys this module would not mint", () => {
    for (const ext of [".vectorcraft", ".svg"]) expect(sourceKeyFromMetadata({ source_key: `designs/2026-11/${ID}${ext}` })).not.toBeNull();
    for (const k of [`designs/2026-11/${ID}.exe`, `designs/2026-11/${ID}.pcraftx`, `designs/../x/${ID}.pcraft`, `other/2026-11/${ID}.pcraft`]) {
      expect(sourceKeyFromMetadata({ source_key: k })).toBeNull();
    }
  });
});
