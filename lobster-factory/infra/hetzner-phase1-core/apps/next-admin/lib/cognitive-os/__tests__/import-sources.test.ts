// The rule under test: a cs_knowledge_sources row only reaches Cognitive OS after title/authors/
// DOI-format/publish-year/body all clear the import-time gate, a Project is reused (never
// duplicated) across runs, and a Source already present in that Project (by title) is skipped
// rather than re-sent.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceDetail } from "@/lib/kb";

const kb = vi.hoisted(() => ({
  listKnowledgeSources: vi.fn(),
  getSourceDetail: vi.fn(),
  markSourceSentToCognitiveOs: vi.fn(),
}));
vi.mock("@/lib/kb", () => ({
  listKnowledgeSources: kb.listKnowledgeSources,
  getSourceDetail: kb.getSourceDetail,
  markSourceSentToCognitiveOs: kb.markSourceSentToCognitiveOs,
}));

const client = vi.hoisted(() => ({
  listCognitiveOsProjects: vi.fn(),
  createCognitiveOsProject: vi.fn(),
  listCognitiveOsSources: vi.fn(),
  createCognitiveOsSource: vi.fn(),
}));
vi.mock("@/lib/cognitive-os/client", () => client);

const { evaluateSourceForImport, importOrganizationSources, parseAuthors } = await import("@/lib/cognitive-os/import-sources");

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function detail(overrides: Partial<SourceDetail> = {}): SourceDetail {
  return {
    id: "src-1",
    title: "A Real Paper",
    kind: "doc",
    isSensitive: false,
    status: "active",
    version: 1,
    docFamilyId: "fam-1",
    canonicalUrl: null,
    folderId: null,
    keywordMode: "inherit",
    body: "Full extracted text body.",
    language: null,
    epistemicType: null,
    authorshipState: null,
    locked: null,
    author: "Jane Smith, John Doe",
    publishedAt: "2020-05-01T00:00:00+00:00",
    venue: "Journal of Testing",
    doi: "10.1234/abcd.5678",
    createdAt: "2020-01-01T00:00:00+00:00",
    cognitiveOsProjectId: null,
    cognitiveOsImportedAt: null,
    ...overrides,
  };
}

describe("parseAuthors", () => {
  it("splits the comma-joined author string and trims each name", () => {
    expect(parseAuthors("Jane Smith, John Doe")).toEqual(["Jane Smith", "John Doe"]);
  });
  it("returns [] for null or blank", () => {
    expect(parseAuthors(null)).toEqual([]);
    expect(parseAuthors("")).toEqual([]);
  });
  it("drops empty segments from a trailing/stray comma", () => {
    expect(parseAuthors("Jane Smith,, ")).toEqual(["Jane Smith"]);
  });
});

describe("evaluateSourceForImport", () => {
  it("passes a fully-formed record", () => {
    const result = evaluateSourceForImport(detail());
    expect(result).toEqual({ eligible: true, authors: ["Jane Smith", "John Doe"], issues: [] });
  });

  it("rejects a missing title", () => {
    const result = evaluateSourceForImport(detail({ title: "   " }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("MISSING_TITLE");
  });

  it("rejects missing authors", () => {
    const result = evaluateSourceForImport(detail({ author: null }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("MISSING_AUTHORS");
  });

  it("rejects a malformed DOI but allows a missing one", () => {
    expect(evaluateSourceForImport(detail({ doi: "not-a-doi" })).issues).toContain("DOI_FORMAT_INVALID");
    expect(evaluateSourceForImport(detail({ doi: null })).issues).not.toContain("DOI_FORMAT_INVALID");
  });

  it("rejects an implausible publish year but allows a missing one", () => {
    expect(evaluateSourceForImport(detail({ publishedAt: "0099-01-01T00:00:00+00:00" })).issues).toContain("PUBLISHED_AT_YEAR_IMPLAUSIBLE");
    expect(evaluateSourceForImport(detail({ publishedAt: null })).issues).not.toContain("PUBLISHED_AT_YEAR_IMPLAUSIBLE");
  });

  it("rejects an empty body (Cognitive OS hard-rejects empty content)", () => {
    const result = evaluateSourceForImport(detail({ body: null }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("MISSING_BODY");
  });

  it("rejects a source flagged sensitive, even when everything else is fully eligible", () => {
    // Same failure class migration 0083 hardened for a different consumer (the customer-service AI):
    // an operator's 敏感 checkbox must not silently do nothing for this consumer either.
    const result = evaluateSourceForImport(detail({ isSensitive: true }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("SENSITIVE_EXCLUDED");
  });
});

describe("importOrganizationSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: write-back succeeds, matching the overwhelming common case — tests that care about
    // the failure path override this explicitly, per markSourceSentToCognitiveOs's real signature
    // (Promise<boolean>, critic finding 2026-09-18: it used to be untyped/unchecked Promise<void>).
    kb.markSourceSentToCognitiveOs.mockResolvedValue(true);
  });

  it("creates a Project on first run, imports every eligible source, and reports rejects", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-1" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsSource.mockResolvedValue({ ok: true, value: { source_id: "cos-1" } });

    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }, { id: "src-2" }], total: 2, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) =>
      Promise.resolve(id === "src-1" ? detail({ id: "src-1" }) : detail({ id: "src-2", title: "Bad Record", author: null })),
    );

    const summary = await importOrganizationSources(ORG_ID);

    expect(client.createCognitiveOsProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: `Knowledge Import: ${ORG_ID}`, data_classification: "Internal" }),
    );
    expect(summary.projectId).toBe("proj-1");
    expect(summary.totalCandidates).toBe(2);
    expect(summary.imported).toBe(1);
    expect(summary.alreadyImported).toBe(0);
    expect(summary.rejected).toEqual([{ sourceId: "src-2", title: "Bad Record", issues: ["MISSING_AUTHORS"] }]);
    expect(client.createCognitiveOsSource).toHaveBeenCalledTimes(1);
    expect(client.createCognitiveOsSource).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ title: "A Real Paper", authors: ["Jane Smith", "John Doe"], media_type: "text/plain" }),
    );
    // Write-back happens for the imported source, never for the rejected one — a rejected source
    // was never actually sent, so recording it as sent would be a false claim.
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledTimes(1);
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledWith(ORG_ID, "src-1", "proj-1");
  });

  it("reuses an existing Project by exact name match instead of creating a duplicate", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-existing", name: `Knowledge Import: ${ORG_ID}` }] });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importOrganizationSources(ORG_ID);

    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
    expect(summary.projectId).toBe("proj-existing");
  });

  it("skips a source whose title already exists in the target Project", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-1", name: `Knowledge Import: ${ORG_ID}` }] });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [{ title: "A Real Paper" }] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.alreadyImported).toBe(1);
    expect(summary.imported).toBe(0);
    expect(client.createCognitiveOsSource).not.toHaveBeenCalled();
    // Self-heal: an already-imported source still gets its next-admin-side write-back re-asserted,
    // in case an earlier run's write-back never landed (or predates migration 0087 entirely).
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledWith(ORG_ID, "src-1", "proj-1");
  });

  it("does NOT re-write an already-imported source whose write-back is already correct (no unbounded per-click UPDATE sweep)", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-1", name: `Knowledge Import: ${ORG_ID}` }] });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [{ title: "A Real Paper" }] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    // cognitiveOsProjectId already matches the target project -- the write-back already landed.
    kb.getSourceDetail.mockResolvedValue(detail({ cognitiveOsProjectId: "proj-1" }));

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.alreadyImported).toBe(1);
    expect(kb.markSourceSentToCognitiveOs).not.toHaveBeenCalled();
    expect(summary.errors).toEqual([]);
  });

  it("surfaces a write-back failure as a soft warning without un-counting a real import", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-1" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsSource.mockResolvedValue({ ok: true, value: { source_id: "cos-1" } });
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());
    // The Cognitive OS create already succeeded; only this app's own bookkeeping write fails.
    kb.markSourceSentToCognitiveOs.mockResolvedValue(false);

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.imported).toBe(1); // the import itself genuinely happened -- not un-counted
    expect(summary.errors).toEqual(["write_back_failed:src-1"]);
  });

  it("paginates through more than one page of candidates", async () => {
    // fetchAllSourceDetails' page size is a fixed internal 200 -- `total` must exceed one page's
    // worth (200) for a second `listKnowledgeSources` call to happen at all, even though this test
    // only returns 1 item per mocked page (the loop only cares about item ids to resolve, not
    // about actually holding 201 rows).
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-1", name: `Knowledge Import: ${ORG_ID}` }] });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsSource.mockResolvedValue({ ok: true, value: { source_id: "cos-x" } });
    kb.listKnowledgeSources
      .mockResolvedValueOnce({ items: [{ id: "src-1" }], total: 201, page: 1, pageSize: 200 })
      .mockResolvedValueOnce({ items: [{ id: "src-2" }], total: 201, page: 2, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) => Promise.resolve(detail({ id, title: id })));

    const summary = await importOrganizationSources(ORG_ID, { projectName: `Knowledge Import: ${ORG_ID}` });

    expect(kb.listKnowledgeSources).toHaveBeenCalledTimes(2);
    expect(summary.totalCandidates).toBe(2);
  });

  it("reports ensure_project failure without touching the KB", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: false, error: "cognitive_os_not_configured" });

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.errors).toEqual(["ensure_project_failed:cognitive_os_not_configured"]);
    expect(kb.listKnowledgeSources).not.toHaveBeenCalled();
  });

  it("isolates one source's createCognitiveOsSource failure — the rest of the batch still imports", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-1" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsSource.mockImplementation((_projectId: string, payload: { title: string }) =>
      Promise.resolve(
        payload.title === "Flaky Paper" ? { ok: false, error: "cognitive_os_unreachable" } : { ok: true, value: { source_id: "cos-ok" } },
      ),
    );
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }, { id: "src-2" }], total: 2, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) =>
      Promise.resolve(id === "src-1" ? detail({ id: "src-1", title: "Flaky Paper" }) : detail({ id: "src-2", title: "Good Paper" })),
    );

    const summary = await importOrganizationSources(ORG_ID);

    // One failed, one succeeded — the loop did not abort on the first error.
    expect(summary.imported).toBe(1);
    expect(summary.errors).toEqual(["src-1:cognitive_os_unreachable"]);
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledTimes(1);
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledWith(ORG_ID, "src-2", "proj-1");
  });
});
