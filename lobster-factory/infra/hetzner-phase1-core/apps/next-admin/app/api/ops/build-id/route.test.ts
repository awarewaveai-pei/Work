import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/ops/build-id", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the running build's id, uncached, so an open page can tell it is out of date", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "build-id-"));
    mkdirSync(path.join(dir, ".next"));
    writeFileSync(path.join(dir, ".next", "BUILD_ID"), "abc123\n");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    const res = GET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ buildId: "abc123" });
  });

  it("returns null without a build (dev server), which turns the check off", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(path.join(tmpdir(), "no-build-")));
    expect(await GET().json()).toEqual({ buildId: null });
  });
});
