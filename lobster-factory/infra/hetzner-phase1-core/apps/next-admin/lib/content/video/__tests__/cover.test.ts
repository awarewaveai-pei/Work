// Card VD.2: which cover a video shows (lib/content/video/cover.ts coversOf) -- the one rule every consumer reads.
import { describe, expect, it } from "vitest";
import { coversOf, type CoverRow } from "../cover";

const V = "video-1";
const row = (id: string, meta: CoverRow["metadata"], created: string, url: string | null = `https://r2/${id}.jpg`): CoverRow =>
  ({ id, object_url: url, mime_type: "image/jpeg", created_at: created, metadata: { coverOf: V, ...meta } });

describe("coversOf", () => {
  it("none chosen: the earliest-registered auto cover (the workbench's best), not the oldest upload", () => {
    const covers = coversOf(V, [
      row("up", { coverKind: "upload" }, "2026-11-14T01:00:00Z"),
      row("a1", { coverKind: "auto", vwJobId: "cover:j:1" }, "2026-11-14T02:00:01Z"),
      row("a0", { coverKind: "auto", vwJobId: "cover:j:0" }, "2026-11-14T02:00:00Z"),
    ]);
    expect(covers.filter((c) => c.chosen).map((c) => c.id)).toEqual(["a0"]);
    expect(covers.map((c) => c.id)).toEqual(["up", "a0", "a1"]);
  });
  it("candidate 0 gone: the next auto cover still wins over an older upload (Codex 8ccdf230 / 52914185)", () => {
    const covers = coversOf(V, [row("up", { coverKind: "upload" }, "2026-11-14T01:00:00Z"), row("a1", { coverKind: "auto", vwJobId: "cover:j:1" }, "2026-11-14T02:00:01Z")]);
    expect(covers.find((c) => c.chosen)?.id).toBe("a1");
  });
  it("the newest chosenAt wins; exactly one is chosen", () => {
    const covers = coversOf(V, [
      row("a0", { coverKind: "auto", vwJobId: "cover:j:0", chosenAt: "2026-11-14T05:00:00Z" }, "2026-11-14T01:00:00Z"),
      row("ai", { coverKind: "ai", chosenAt: "2026-11-14T06:00:00Z" }, "2026-11-14T02:00:00Z"),
    ]);
    expect(covers.filter((c) => c.chosen).map((c) => c.id)).toEqual(["ai"]);
  });
  it("rows of another video, without a url or not an image are not covers", () => {
    expect(coversOf(V, [
      { ...row("x", { coverKind: "auto" }, "2026-11-14T01:00:00Z"), metadata: { coverOf: "video-2", coverKind: "auto" } },
      row("nourl", { coverKind: "auto" }, "2026-11-14T01:00:00Z", null),
      { ...row("mp4", { coverKind: "auto" }, "2026-11-14T01:00:00Z"), mime_type: "video/mp4" },
    ])).toEqual([]);
  });
  it("no auto candidate and nothing chosen: the oldest cover; an unknown kind reads as upload", () => {
    const covers = coversOf(V, [row("b", { coverKind: "?" }, "2026-11-14T02:00:00Z"), row("a", { coverKind: "ai" }, "2026-11-14T01:00:00Z")]);
    expect(covers.find((c) => c.chosen)?.id).toBe("a");
    expect(covers.find((c) => c.id === "b")?.kind).toBe("upload");
  });
});

// Codex a83c1b15 F2: the chosen cover comes from bounded queries, never from an unbounded list a row cap can cut.
import { chosenCover } from "../cover";
import { fakeDb } from "./fake-db";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("chosenCover (bounded queries)", () => {
  const many = (extra: CoverRow[]) => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: `u${i}`, organization_id: "o", object_url: `https://r2/u${i}.jpg`, mime_type: "image/jpeg",
      created_at: new Date(Date.parse("2026-11-14T02:00:00Z") + i * 1000).toISOString(), metadata: { coverOf: V, coverKind: "upload" } }));
    return fakeDb(() => ({ media_assets: [...extra.map((r) => ({ ...r, organization_id: "o" })), ...rows] })) as unknown as SupabaseClient;
  };
  it("finds the newest chosenAt even behind 1200 newer rows", async () => {
    const db = many([row("old-chosen", { coverKind: "upload", chosenAt: "2026-11-14T09:00:00Z" }, "2026-11-14T00:00:00Z"),
      row("chosen-before", { coverKind: "ai", chosenAt: "2026-11-14T08:00:00Z" }, "2026-11-14T00:00:01Z")]);
    expect((await chosenCover(db, "o", V))?.id).toBe("old-chosen");
  });
  it("nothing chosen: the earliest-registered auto cover, then the oldest; another org sees none", async () => {
    const db = many([row("a1", { coverKind: "auto", vwJobId: "cover:j:1" }, "2026-11-14T00:00:02Z"), row("a0", { coverKind: "auto", vwJobId: "cover:j:0" }, "2026-11-14T00:00:00Z")]);
    expect((await chosenCover(db, "o", V))?.id).toBe("a0");
    expect((await chosenCover(many([]), "o", V))?.id).toBe("u0");
    // only a later candidate left: the bounded queries agree with coversOf
    const later = many([row("a1", { coverKind: "auto", vwJobId: "cover:j:1" }, "2026-11-14T00:00:03Z")]);
    expect((await chosenCover(later, "o", V))?.id).toBe("a1");
    expect(await chosenCover(db, "other", V)).toBeNull();
  });
});
