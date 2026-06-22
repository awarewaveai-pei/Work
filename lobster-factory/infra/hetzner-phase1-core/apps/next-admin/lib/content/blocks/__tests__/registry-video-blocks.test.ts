import { describe, it, expect } from "vitest";
import { byId, register, byKind, listAll } from "../registry";
// 直接 import 三個 video 積木檔 → 觸發各自 register()（side-effect）。
import "../video-pipeline";
import "../video-prepare";
import "../video-render";

describe("registry byId accessor", () => {
  it("returns a registered enabled block by id", () => {
    register({ id: "__test/x", title: "X", kind: "ai", enabled: true, run: async () => "ok" });
    expect(byId("__test/x")?.title).toBe("X");
  });
  it("returns undefined for unknown id", () => {
    expect(byId("__test/nope")).toBeUndefined();
  });
  it("returns undefined for a disabled block", () => {
    register({ id: "__test/off", title: "Off", kind: "ai", enabled: false, run: async () => "ok" });
    expect(byId("__test/off")).toBeUndefined();
  });
});

describe("video blocks registration (D/4 safe-register step)", () => {
  it("registers video/pipeline, video/prepare, video/render with correct titles", () => {
    expect(byId("video/pipeline")).toBeDefined();
    expect(byId("video/prepare")?.title).toBe("準備場景");
    expect(byId("video/render")?.title).toBe("渲染影片");
  });

  it("all three are kind=video", () => {
    for (const id of ["video/pipeline", "video/prepare", "video/render"]) {
      expect(byId(id)?.kind).toBe("video");
    }
    const videoIds = byKind("video").map((b) => b.id);
    expect(videoIds).toEqual(expect.arrayContaining(["video/pipeline", "video/prepare", "video/render"]));
  });

  it("listAll manifest includes the staged blocks", () => {
    const ids = listAll().map((b) => b.id);
    expect(ids).toContain("video/prepare");
    expect(ids).toContain("video/render");
  });
});
