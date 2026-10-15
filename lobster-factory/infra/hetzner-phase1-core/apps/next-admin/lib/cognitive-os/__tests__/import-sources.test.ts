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
  getCognitiveOsProject: vi.fn(),
  createCognitiveOsProject: vi.fn(),
  listCognitiveOsSources: vi.fn(),
  createCognitiveOsSource: vi.fn(),
}));
vi.mock("@/lib/cognitive-os/client", () => client);

const folders = vi.hoisted(() => ({
  getFolder: vi.fn(),
  getFolderCognitiveOsProjectId: vi.fn(),
  setFolderCognitiveOsProjectId: vi.fn(),
}));
vi.mock("@/lib/kb/folders", () => folders);

// organizations.metadata.cognitive_os_import_project_id storage (2026-09-18 critical fix) -- keyed per
// organization id so the cross-organization non-collision test below can prove two different orgs
// never share state. Same read-select/write-update shape as every other organizations.metadata
// writer in this app (e.g. app/api/ops/clients/[slug]/cs-config/route.test.ts's own sb mock).
const orgMeta = vi.hoisted(() => ({
  byOrgId: new Map<string, Record<string, unknown>>(),
  updateCalls: [] as Array<{ id: string; metadata: Record<string, unknown> }>,
}));
const sb = vi.hoisted(() => ({
  from: vi.fn((table: string) => {
    if (table !== "organizations") throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: () => Promise.resolve({ data: { id, metadata: orgMeta.byOrgId.get(id) ?? {} }, error: null }),
        }),
      }),
      update: (patch: { metadata: Record<string, unknown> }) => ({
        eq: (_col: string, id: string) => {
          orgMeta.byOrgId.set(id, patch.metadata);
          orgMeta.updateCalls.push({ id, metadata: patch.metadata });
          return Promise.resolve({ error: null });
        },
      }),
    };
  }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { evaluateSourceForImport, importFolderSources, importOrganizationSources, parseAuthors } = await import("@/lib/cognitive-os/import-sources");

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
    hciSourceId: null,
    hciImportedAt: null,
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
    orgMeta.byOrgId.clear();
    orgMeta.updateCalls.length = 0;
    // Default: write-back succeeds, matching the overwhelming common case — tests that care about
    // the failure path override this explicitly, per markSourceSentToCognitiveOs's real signature
    // (Promise<boolean>, critic finding 2026-09-18: it used to be untyped/unchecked Promise<void>).
    kb.markSourceSentToCognitiveOs.mockResolvedValue(true);
    client.getCognitiveOsProject.mockResolvedValue({ ok: true, value: {} });
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

  // Operator, 2026-09-18: two real projects both named "Knowledge Import: <uuid>" were
  // indistinguishable at a glance. organizationName fixes naming for new Projects without
  // orphaning organizations that already imported under the old id-based name.
  it("names a brand-new Project after the organization, not its opaque id, when organizationName is given", async () => {
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-named" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importOrganizationSources(ORG_ID, { organizationName: "EdD 論文研究" });

    // 8-char id suffix (see importOrganizationSources's own header comment) -- guarantees this
    // string can never collide with another organization's Project name at Cognitive OS's
    // UNIQUE(tenant_id, workspace_id, name) constraint, not just decoration.
    expect(client.createCognitiveOsProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: `Knowledge Import: EdD 論文研究 (${ORG_ID.slice(0, 8)})` }),
    );
    expect(summary.projectId).toBe("proj-named");
    // Backfilled into metadata immediately, not just resolved in-memory for this one call.
    expect(orgMeta.byOrgId.get(ORG_ID)).toEqual({ cognitive_os_import_project_id: "proj-named" });
  });

  it("reuses an organization's existing legacy id-named Project instead of forking a second, newly-named one", async () => {
    // Cognitive OS has no project-rename endpoint (checked directly against
    // ai_lego/apps/api/main.py's route list before writing this) -- an org that already has
    // `Knowledge Import: <uuid>` MUST keep landing there, or its prior imports get orphaned in a
    // Project the operator no longer sees results in.
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-legacy", name: `Knowledge Import: ${ORG_ID}` }] });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importOrganizationSources(ORG_ID, { organizationName: "EdD 論文研究" });

    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
    expect(summary.projectId).toBe("proj-legacy");
    // The whole point of the backfill: next run resolves from metadata alone (see the fast-path
    // test below), never re-scanning listCognitiveOsProjects for this organization again.
    expect(orgMeta.byOrgId.get(ORG_ID)).toEqual({ cognitive_os_import_project_id: "proj-legacy" });
  });

  it("resolves from stored metadata alone once set, without calling listCognitiveOsProjects again", async () => {
    orgMeta.byOrgId.set(ORG_ID, { cognitive_os_import_project_id: "proj-cached", some_other_key: "preserved" });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importOrganizationSources(ORG_ID, { organizationName: "EdD 論文研究" });

    expect(client.listCognitiveOsProjects).not.toHaveBeenCalled();
    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
    expect(summary.projectId).toBe("proj-cached");
  });

  // 2026-10-02: Cognitive OS erased the project a stored id named; every later import was sent into nothing.
  it("a stored Project that Cognitive OS erased is replaced by a fresh one, the pointer overwritten and the sources re-sent", async () => {
    orgMeta.byOrgId.set(ORG_ID, { cognitive_os_import_project_id: "proj-erased", some_other_key: "preserved" });
    client.getCognitiveOsProject.mockResolvedValue({ ok: false, status: 404, error: "PROJECT_NOT_FOUND: 'proj-erased'" });
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-new" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsSource.mockResolvedValue({ ok: true, value: { source_id: "cos-1" } });
    // two KB rows with one title, as edd-research really holds: one Cognitive OS source, both rows marked
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }, { id: "src-2" }], total: 2, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) => Promise.resolve(detail({ id, cognitiveOsProjectId: "proj-erased" })));

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.projectId).toBe("proj-new");
    expect(orgMeta.byOrgId.get(ORG_ID)).toEqual({ cognitive_os_import_project_id: "proj-new", some_other_key: "preserved" });
    expect(summary.errors).toEqual(["stored_project_gone:proj-erased"]); // said, never silent: a re-bootstrapped identity reads every project as gone
    expect(client.createCognitiveOsSource).toHaveBeenCalledTimes(1);
    expect([summary.imported, summary.alreadyImported]).toEqual([1, 1]);
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledWith(ORG_ID, "src-1", "proj-new");
    expect(kb.markSourceSentToCognitiveOs).toHaveBeenCalledWith(ORG_ID, "src-2", "proj-new");
  });

  it.each([
    [502, "cognitive_os_error_502"],
    [404, "Not Found"], // a 404 that is not Cognitive OS saying PROJECT_NOT_FOUND: wrong base URL or route
  ])("a %i that is not PROJECT_NOT_FOUND is an error, never a reason to fork a second Project", async (status, error) => {
    orgMeta.byOrgId.set(ORG_ID, { cognitive_os_import_project_id: "proj-cached" });
    client.getCognitiveOsProject.mockResolvedValue({ ok: false, status, error });

    const summary = await importOrganizationSources(ORG_ID);

    expect(summary.errors).toEqual([`ensure_project_failed:${error}`]);
    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
    expect(orgMeta.updateCalls).toEqual([]);
  });

  // The actual vulnerability the critic caught: an earlier version of this fix matched Projects by
  // organizationName alone. organizations.name has no uniqueness constraint and is settable via the
  // public signup form — two different, unrelated organizations picking the same display name must
  // never land in the same Cognitive OS Project (a real cross-tenant knowledge-base leak).
  it("does NOT merge two different organizations that happen to share the same organizationName", async () => {
    const ORG_A = "aaaaaaaa-1111-4111-8111-000000000001";
    const ORG_B = "bbbbbbbb-2222-4111-8111-000000000002";
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [] });
    client.createCognitiveOsProject
      .mockResolvedValueOnce({ ok: true, value: { project_id: "proj-A" } })
      .mockResolvedValueOnce({ ok: true, value: { project_id: "proj-B" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summaryA = await importOrganizationSources(ORG_A, { organizationName: "Acme Studio" });
    const summaryB = await importOrganizationSources(ORG_B, { organizationName: "Acme Studio" });

    expect(summaryA.projectId).toBe("proj-A");
    expect(summaryB.projectId).toBe("proj-B");
    expect(summaryA.projectId).not.toBe(summaryB.projectId);
    expect(client.createCognitiveOsProject).toHaveBeenCalledTimes(2);
    // Each organization's own metadata points at its own Project — never each other's.
    expect(orgMeta.byOrgId.get(ORG_A)).toEqual({ cognitive_os_import_project_id: "proj-A" });
    expect(orgMeta.byOrgId.get(ORG_B)).toEqual({ cognitive_os_import_project_id: "proj-B" });
  });

  // Narrower than the test above, and deliberately so: the id-suffix in preferredName (see
  // importOrganizationSources's header comment) already makes a REAL accidental name collision
  // astronomically unlikely on its own, which would make a same-organizationName test alone too
  // weak to prove the underlying matching MECHANISM is actually id-anchored rather than
  // name-anchored (verified directly: reverting ensureProjectForOrganization's match target from
  // legacyName back to preferredName still left the test above passing, because two different real
  // org ids can never produce the same suffixed preferredName either way -- this test closes that
  // gap by handing the flawed match target a name it WOULD wrongly match on if matching ever fell
  // back to preferredName instead of the id-derived legacyName).
  it("never reuses a Project found by matching its human-readable display name, even if one coincidentally exists", async () => {
    const coincidentalName = `Knowledge Import: Acme Studio (${ORG_ID.slice(0, 8)})`;
    client.listCognitiveOsProjects.mockResolvedValue({ ok: true, value: [{ project_id: "proj-unrelated", name: coincidentalName }] });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-real" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importOrganizationSources(ORG_ID, { organizationName: "Acme Studio" });

    expect(client.createCognitiveOsProject).toHaveBeenCalled();
    expect(summary.projectId).toBe("proj-real");
    expect(summary.projectId).not.toBe("proj-unrelated");
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

// migration 0089 — one Project per KB folder instead of one per whole organization (operator,
// 2026-09-18: "為什麼不延續需搜尋時新增的資料夾"). Identity is anchored to folderId, stored directly
// on cs_knowledge_folders — no legacy-name fallback to test here (unlike importOrganizationSources),
// since no folder was ever sent to Cognitive OS before this column existed.
describe("importFolderSources", () => {
  const FOLDER_ID = "cccccccc-3333-4111-8111-000000000003";

  beforeEach(() => {
    vi.clearAllMocks();
    folders.setFolderCognitiveOsProjectId.mockResolvedValue(true);
    kb.markSourceSentToCognitiveOs.mockResolvedValue(true);
    client.getCognitiveOsProject.mockResolvedValue({ ok: true, value: {} });
  });

  it("a folder whose stored Project Cognitive OS erased gets a fresh one linked back", async () => {
    folders.getFolder.mockResolvedValue({ id: FOLDER_ID, name: "Research", parentId: null });
    folders.getFolderCognitiveOsProjectId.mockResolvedValue("proj-erased");
    client.getCognitiveOsProject.mockResolvedValue({ ok: false, status: 404, error: "PROJECT_NOT_FOUND: 'proj-erased'" });
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-new" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importFolderSources(ORG_ID, FOLDER_ID);

    expect(summary.projectId).toBe("proj-new");
    expect(folders.setFolderCognitiveOsProjectId).toHaveBeenCalledWith(ORG_ID, FOLDER_ID, "proj-new");
    expect(summary.errors).toEqual(["stored_project_gone:proj-erased"]);
  });

  it("reports a typed error instead of throwing when the folder does not exist (or belongs to another organization)", async () => {
    folders.getFolder.mockResolvedValue(null);

    const summary = await importFolderSources(ORG_ID, FOLDER_ID);

    expect(summary.errors).toEqual(["folder_not_found"]);
    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
  });

  it("names a brand-new Project after the folder (with an id suffix) on first send, and stores its id back on the folder row", async () => {
    folders.getFolder.mockResolvedValue({ id: FOLDER_ID, name: "Theo Gerard Farrell", parentId: null });
    folders.getFolderCognitiveOsProjectId.mockResolvedValue(null);
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-folder-1" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importFolderSources(ORG_ID, FOLDER_ID);

    expect(client.createCognitiveOsProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: `Knowledge Import: Theo Gerard Farrell (${FOLDER_ID.slice(0, 8)})` }),
    );
    expect(folders.setFolderCognitiveOsProjectId).toHaveBeenCalledWith(ORG_ID, FOLDER_ID, "proj-folder-1");
    expect(summary.projectId).toBe("proj-folder-1");
    // Fetches THIS folder's sources, not the whole organization's.
    expect(kb.listKnowledgeSources).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ folderId: FOLDER_ID }));
  });

  it("resolves from the folder's stored project id on later runs, without creating a second Project", async () => {
    folders.getFolder.mockResolvedValue({ id: FOLDER_ID, name: "Theo Gerard Farrell", parentId: null });
    folders.getFolderCognitiveOsProjectId.mockResolvedValue("proj-folder-cached");
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importFolderSources(ORG_ID, FOLDER_ID);

    expect(client.createCognitiveOsProject).not.toHaveBeenCalled();
    expect(folders.setFolderCognitiveOsProjectId).not.toHaveBeenCalled();
    expect(summary.projectId).toBe("proj-folder-cached");
  });

  it("does NOT merge two different folders that happen to share the same name", async () => {
    const FOLDER_A = "cccccccc-aaaa-4111-8111-00000000000a";
    const FOLDER_B = "cccccccc-bbbb-4111-8111-00000000000b";
    folders.getFolderCognitiveOsProjectId.mockResolvedValue(null);
    folders.getFolder.mockImplementation((_org: string, id: string) => Promise.resolve({ id, name: "Research", parentId: null }));
    client.createCognitiveOsProject
      .mockResolvedValueOnce({ ok: true, value: { project_id: "proj-A" } })
      .mockResolvedValueOnce({ ok: true, value: { project_id: "proj-B" } });
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summaryA = await importFolderSources(ORG_ID, FOLDER_A);
    const summaryB = await importFolderSources(ORG_ID, FOLDER_B);

    expect(summaryA.projectId).toBe("proj-A");
    expect(summaryB.projectId).toBe("proj-B");
    expect(folders.setFolderCognitiveOsProjectId).toHaveBeenCalledWith(ORG_ID, FOLDER_A, "proj-A");
    expect(folders.setFolderCognitiveOsProjectId).toHaveBeenCalledWith(ORG_ID, FOLDER_B, "proj-B");
  });

  // db-expert review, 2026-09-18: setFolderCognitiveOsProjectId now reports whether the UPDATE
  // actually matched a row (Supabase/PostgREST returns error:null even on a zero-row match) — this
  // proves the caller actually reads and surfaces that signal, not just that the function itself
  // returns the right boolean in isolation.
  it("surfaces a warning (without aborting the import) when the folder-project backfill write matches zero rows", async () => {
    folders.getFolder.mockResolvedValue({ id: FOLDER_ID, name: "Theo Gerard Farrell", parentId: null });
    folders.getFolderCognitiveOsProjectId.mockResolvedValue(null);
    client.createCognitiveOsProject.mockResolvedValue({ ok: true, value: { project_id: "proj-folder-1" } });
    folders.setFolderCognitiveOsProjectId.mockResolvedValue(false); // stale/foreign folderId, zero rows matched
    client.listCognitiveOsSources.mockResolvedValue({ ok: true, value: [] });
    kb.listKnowledgeSources.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 200 });

    const summary = await importFolderSources(ORG_ID, FOLDER_ID);

    // The Project really was created and really is usable -- a failed local bookkeeping write must
    // not throw the whole import away.
    expect(summary.projectId).toBe("proj-folder-1");
    expect(summary.errors).toContain(`folder_project_link_write_failed:${FOLDER_ID}`);
  });
});
