// D7 / V4.9: an upload without the uploader's rights statement is refused before anything is stored; with it, the origin records rightsConfirmed.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putDesignObject = vi.hoisted(() => vi.fn());
const signOrigin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/r2", () => ({
  isR2Configured: () => true,
  buildDesignKey: () => "designs/2026-10/abc.png",
  putDesignObject,
  deleteDesignObject: vi.fn(),
}));
vi.mock("@/lib/content/video/asset-origin", () => ({ signOrigin }));

import { POST } from "./route";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(32)]);
function upload(fields: Record<string, string>) {
  const fd = new FormData();
  fd.append("file", new File([PNG], "a.png", { type: "image/png" }));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return POST(new NextRequest("http://localhost/api/video/upload-asset", { method: "POST", body: fd, headers: { "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  putDesignObject.mockResolvedValue({ ok: true, publicUrl: "https://r2.example.com/designs/2026-10/abc.png" });
  signOrigin.mockImplementation((url: string, o: object) => ({ url, ...o }));
});

describe("/api/video/upload-asset rights statement", () => {
  it("refuses a file without rightsConfirmed=true and stores nothing", async () => {
    expect((await upload({})).status).toBe(400);
    expect((await upload({ rightsConfirmed: "false" })).status).toBe(400);
    expect(putDesignObject).not.toHaveBeenCalled();
  });

  it("accepts it with rightsConfirmed=true and signs the origin as rights-confirmed", async () => {
    const res = await upload({ rightsConfirmed: "true" });
    expect(res.status).toBe(200);
    expect(signOrigin).toHaveBeenCalledWith(expect.any(String), { kind: "upload", rightsConfirmed: true });
  });
});
