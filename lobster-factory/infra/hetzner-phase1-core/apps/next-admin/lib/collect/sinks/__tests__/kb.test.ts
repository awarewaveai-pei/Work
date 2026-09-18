// lib/collect/sinks/kb.ts — auto-foldering added 2026-09-18 (operator: "搜尋到的資料應該直接進入一個資料夾,
// 不是散落一地"). Focused unit coverage for that addition specifically; the sink's core
// ingest/skip/error accounting is already covered end-to-end via collect-c1.test.ts's full-crawl
// harness — this file only needs a bare SinkCtx + canned RawDocs, no orchestrator involved.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawDoc, SinkCtx } from "@/lib/collect/types";
import type { IngestResult } from "@/lib/kb/types";

const kb = vi.hoisted(() => ({ ingestKnowledge: vi.fn() }));
vi.mock("@/lib/kb", () => ({ ingestKnowledge: kb.ingestKnowledge }));

const folders = vi.hoisted(() => ({ findOrCreateFolderByName: vi.fn(), moveSourceToFolder: vi.fn() }));
vi.mock("@/lib/kb/folders", () => folders);

const { createKbSink, resetFolderCacheForTests } = await import("@/lib/collect/sinks/kb");

function doc(overrides: Partial<RawDoc> = {}): RawDoc {
  return {
    uri: "https://example.com/a",
    canonicalUrl: "https://example.com/a",
    contentHash: "hash-a",
    mime: "text/html",
    title: "A",
    author: null,
    contentType: "web_page",
    text: "hello world",
    raw: null,
    fetchedAt: new Date().toISOString(),
    publishedAt: null,
    collector: "collect/http-html",
    tenantRef: "org-1",
    provenance: { epistemic_type: "EVIDENCE", authorship_state: "SOURCE_QUOTATION", locked: null },
    meta: {},
    ...overrides,
  };
}

function ctx(runId = "run-1"): SinkCtx {
  return { tenantRef: "org-1", runId, log: () => {} };
}

function ingested(overrides: Partial<IngestResult> = {}): IngestResult {
  return { sourceId: "src-1", docFamilyId: "fam-1", version: 1, chunks: 2, unchanged: false, inheritedFolderId: null, ...overrides };
}

beforeEach(() => {
  kb.ingestKnowledge.mockReset();
  folders.findOrCreateFolderByName.mockReset();
  folders.moveSourceToFolder.mockReset();
  folders.findOrCreateFolderByName.mockResolvedValue({ ok: true, id: "folder-1" });
  folders.moveSourceToFolder.mockResolvedValue({ ok: true });
  resetFolderCacheForTests(); // the sink's own folder-resolution cache is module-level, not per-test
});

describe("sink/kb auto-foldering", () => {
  it("never touches folders for a doc with no searchQuery (a plain added URL, RSS/sitemap discovery)", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested());
    const report = await createKbSink().run([doc()], ctx());
    expect(report.written).toBe(1);
    expect(folders.findOrCreateFolderByName).not.toHaveBeenCalled();
    expect(folders.moveSourceToFolder).not.toHaveBeenCalled();
  });

  it("files a newly-written search-driven doc into a keyword_timestamp folder", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested());
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.written).toBe(1);
    expect(folders.findOrCreateFolderByName).toHaveBeenCalledTimes(1);
    const [orgArg, nameArg, parentArg] = folders.findOrCreateFolderByName.mock.calls[0];
    expect(orgArg).toBe("org-1");
    expect(nameArg).toMatch(/^art therapy_\d{12}$/); // YYYYMMDDHHmm
    expect(parentArg).toBeNull();
    expect(folders.moveSourceToFolder).toHaveBeenCalledWith("org-1", "src-1", "folder-1");
  });

  it("resolves the folder once per (runId, query) and reuses it across every doc in the same run", async () => {
    kb.ingestKnowledge.mockResolvedValueOnce(ingested({ sourceId: "src-1" })).mockResolvedValueOnce(ingested({ sourceId: "src-2" }));
    const report = await createKbSink().run(
      [doc({ uri: "https://example.com/a", meta: { searchQuery: "art therapy" } }), doc({ uri: "https://example.com/b", canonicalUrl: "https://example.com/b", meta: { searchQuery: "art therapy" } })],
      ctx("run-shared"),
    );
    expect(report.written).toBe(2);
    expect(folders.findOrCreateFolderByName).toHaveBeenCalledTimes(1);
    expect(folders.moveSourceToFolder).toHaveBeenNthCalledWith(1, "org-1", "src-1", "folder-1");
    expect(folders.moveSourceToFolder).toHaveBeenNthCalledWith(2, "org-1", "src-2", "folder-1");
  });

  it("does not re-file an unchanged (already-stored) document even if it carries a searchQuery", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested({ unchanged: true }));
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.skipped).toBe(1);
    expect(folders.findOrCreateFolderByName).not.toHaveBeenCalled();
  });

  it("does not re-file a content-changed re-ingest that already has a real inherited folder (critic finding, 2026-09-18: lib/kb/rag.ts already carries the PRIOR version's folderId forward on purpose — re-foldering here would fight that on every edit to a search-driven page)", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested({ version: 2, unchanged: false, inheritedFolderId: "folder-manual" }));
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.written).toBe(1); // the content-changed write itself still lands
    expect(folders.findOrCreateFolderByName).not.toHaveBeenCalled();
    expect(folders.moveSourceToFolder).not.toHaveBeenCalled();
  });

  it("DOES re-file a content-changed re-ingest that was never actually filed (operator report, 2026-09-18: gating on version===1 alone made a document collected once before this feature existed, then re-collected with changed text, permanently unfolderable even though inheritedFolderId was null both times)", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested({ version: 2, unchanged: false, inheritedFolderId: null }));
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.written).toBe(1);
    expect(folders.findOrCreateFolderByName).toHaveBeenCalledTimes(1);
    expect(folders.moveSourceToFolder).toHaveBeenCalledWith("org-1", "src-1", "folder-1");
  });

  it("does not cache a failed resolution — the next doc in a later run gets a fresh attempt (critic finding, 2026-09-18)", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested());
    folders.findOrCreateFolderByName.mockResolvedValueOnce({ ok: false, error: "write_failed" });
    const first = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx("run-a"));
    expect(first.errors).toEqual(expect.arrayContaining([expect.stringContaining("folder_assign_failed")]));

    folders.findOrCreateFolderByName.mockResolvedValueOnce({ ok: true, id: "folder-2" });
    const second = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx("run-b"));
    expect(folders.findOrCreateFolderByName).toHaveBeenCalledTimes(2); // not served from a poisoned cache entry
    expect(folders.moveSourceToFolder).toHaveBeenCalledWith("org-1", "src-1", "folder-2");
    expect(second.errors ?? []).not.toEqual(expect.arrayContaining([expect.stringContaining("folder_assign_failed")]));
  });

  it("a folder-assignment failure is reported but does not undo the already-successful write", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested());
    folders.moveSourceToFolder.mockResolvedValue({ ok: false, error: "not_found" });
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.written).toBe(1); // the ingest itself is unaffected
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringContaining("folder_assign_failed")]));
  });

  it("a thrown error while resolving the folder is caught, not left as an unhandled rejection", async () => {
    kb.ingestKnowledge.mockResolvedValue(ingested());
    folders.findOrCreateFolderByName.mockRejectedValue(new Error("boom"));
    const report = await createKbSink().run([doc({ meta: { searchQuery: "art therapy" } })], ctx());
    expect(report.written).toBe(1);
    expect(report.errors).toEqual(expect.arrayContaining([expect.stringContaining("folder_assign_failed")]));
  });
});
