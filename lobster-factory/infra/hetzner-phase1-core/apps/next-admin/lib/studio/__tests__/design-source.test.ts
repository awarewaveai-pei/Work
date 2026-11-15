// design-source.ts: one extension -> sniffer table drives the accepted formats (C5.1). .psd = real ZIP with a root manifest.json.
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { cleanSourceName, SOURCE_EXTS, sourceBytesMatch, sourceKeyFor, sourceKeyFromMetadata, withSourceUrls } from "../design-source";

// What POST /api/tools/designs checks for a sourceUpload: the name's extension, then the bytes against it.
const parse = (name: string, data: Buffer | string) => {
  const c = cleanSourceName(name);
  if (!c) return { ok: false as const, error: "bad name" };
  return sourceBytesMatch(c.ext, Buffer.from(data)) ? { ok: true as const, name: c.name, ext: c.ext } : { ok: false as const, error: `source content is not a ${c.ext} file` };
};

describe("SOURCE_EXTS is the single list", () => {
  it("has the three formats; any other extension is refused", () => {
    expect([...SOURCE_EXTS]).toEqual([".vectorcraft", ".svg", ".psd"]);
    expect(cleanSourceName("a.exe")).toBeNull();
  });
});

const psd = (version = 1, len = 64) => { const b = Buffer.alloc(len); b.write("8BPS", 0, "latin1"); b.writeUInt16BE(version, 4); return b; };

describe(".psd sniffer", () => {
  it("accepts a PSD and a PSB header", () => {
    for (const v of [1, 2]) expect(parse("poster.psd", psd(v))).toMatchObject({ ok: true, name: "poster.psd", ext: ".psd" });
  });

  it("rejects wrong magic, wrong version, non-zero reserved bytes, a short header", () => {
    const badReserved = psd(); badReserved[8] = 1;
    const wrongMagic = psd(); wrongMagic.write("8BPX", 0, "latin1");
    for (const data of [wrongMagic, psd(3), psd(0), badReserved, psd(1, 20), Buffer.from("8BPS")]) {
      expect(parse("a.psd", data)).toMatchObject({ ok: false, error: "source content is not a .psd file" });
    }
  });

  it("does not let a .psd label carry another format's bytes, nor the reverse", () => {
    expect(parse("a.psd", "<svg xmlns='x'/>").ok).toBe(false);
    expect(parse("a.svg", psd()).ok).toBe(false);
    expect(parse("a.vectorcraft", psd()).ok).toBe(false);
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
  it("mints <preview id>.psd and reads it back as source_url", () => {
    const key = sourceKeyFor(`designs/2026-11/${ID}.png`, ".psd");
    expect(key).toBe(`designs/2026-11/${ID}.psd`);
    expect(sourceKeyFromMetadata({ source_key: key })).toBe(key);
    const [row] = withSourceUrls([{ id: "r", metadata: { source_key: key } }], () => "https://r2.test");
    expect(row.source_url).toBe(`https://r2.test/${key}`);
  });
  it("still reads .vectorcraft/.svg keys and refuses keys this module would not mint", () => {
    for (const ext of [".vectorcraft", ".svg"]) expect(sourceKeyFromMetadata({ source_key: `designs/2026-11/${ID}${ext}` })).not.toBeNull();
    for (const k of [`designs/2026-11/${ID}.exe`, `designs/2026-11/${ID}.psdx`, `designs/../x/${ID}.psd`, `other/2026-11/${ID}.psd`]) {
      expect(sourceKeyFromMetadata({ source_key: k })).toBeNull();
    }
  });
});
