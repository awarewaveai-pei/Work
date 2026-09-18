// The rule under test: a cs_knowledge_sources row only reaches HCI-30 after it clears the
// URL-present/not-sensitive gate, a row already sent (hciSourceId set) is never re-sent, and a
// non-'written' HCI-30 outcome (flagged/failed/timed_out) is recorded as an error, never silently
// dropped or miscounted as a real import.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceDetail } from "@/lib/kb";

const kb = vi.hoisted(() => ({
  listKnowledgeSources: vi.fn(),
  getSourceDetail: vi.fn(),
  markSourceSentToHci: vi.fn(),
}));
vi.mock("@/lib/kb", () => ({
  listKnowledgeSources: kb.listKnowledgeSources,
  getSourceDetail: kb.getSourceDetail,
  markSourceSentToHci: kb.markSourceSentToHci,
}));

const client = vi.hoisted(() => ({
  createHciSeed: vi.fn(),
  isHciConfigured: vi.fn(),
}));
vi.mock("@/lib/hci/client", () => client);

const { evaluateSourceForHciImport, importOrganizationSourcesToHci } = await import("@/lib/hci/import-sources");

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function detail(overrides: Partial<SourceDetail> = {}): SourceDetail {
  return {
    id: "src-1",
    title: "Acme Corp — About Us",
    kind: "web",
    isSensitive: false,
    status: "active",
    version: 1,
    docFamilyId: "fam-1",
    canonicalUrl: "https://acme.example.com/about",
    folderId: null,
    keywordMode: "inherit",
    body: "Full extracted text body.",
    language: null,
    epistemicType: null,
    authorshipState: null,
    locked: null,
    author: null,
    publishedAt: null,
    venue: null,
    doi: null,
    createdAt: "2020-01-01T00:00:00+00:00",
    cognitiveOsProjectId: null,
    cognitiveOsImportedAt: null,
    hciSourceId: null,
    hciImportedAt: null,
    ...overrides,
  };
}

describe("evaluateSourceForHciImport", () => {
  it("passes a source with a canonical URL and no sensitive flag", () => {
    expect(evaluateSourceForHciImport(detail())).toEqual({ eligible: true, issues: [] });
  });

  it("rejects a missing canonical URL", () => {
    const result = evaluateSourceForHciImport(detail({ canonicalUrl: null }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("MISSING_URL");
  });

  it("rejects a whitespace-only canonical URL", () => {
    expect(evaluateSourceForHciImport(detail({ canonicalUrl: "   " })).issues).toContain("MISSING_URL");
  });

  it("rejects a source flagged sensitive, even with a valid URL", () => {
    const result = evaluateSourceForHciImport(detail({ isSensitive: true }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("SENSITIVE_EXCLUDED");
  });
});

describe("importOrganizationSourcesToHci", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.isHciConfigured.mockReturnValue(true);
    kb.markSourceSentToHci.mockResolvedValue(true);
  });

  it("reports hci_not_configured without touching the KB", async () => {
    client.isHciConfigured.mockReturnValue(false);

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary).toEqual({ organizationId: ORG_ID, totalCandidates: 0, imported: 0, alreadyImported: 0, rejected: [], errors: ["hci_not_configured"] });
    expect(kb.listKnowledgeSources).not.toHaveBeenCalled();
  });

  it("sends every eligible source and reports rejects", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }, { id: "src-2" }], total: 2, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) =>
      Promise.resolve(id === "src-1" ? detail({ id: "src-1" }) : detail({ id: "src-2", title: "No URL row", canonicalUrl: null })),
    );
    client.createHciSeed.mockResolvedValue({ ok: true, value: { outcome: "written", retryable: false, jobId: "job-1", sourceId: "hci-src-1", snapshotId: "snap-1", candidateRelatedSources: [] } });

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(client.createHciSeed).toHaveBeenCalledTimes(1);
    expect(client.createHciSeed).toHaveBeenCalledWith("https://acme.example.com/about");
    expect(summary.totalCandidates).toBe(2);
    expect(summary.imported).toBe(1);
    expect(summary.alreadyImported).toBe(0);
    expect(summary.rejected).toEqual([{ sourceId: "src-2", title: "No URL row", issues: ["MISSING_URL"] }]);
    expect(kb.markSourceSentToHci).toHaveBeenCalledTimes(1);
    expect(kb.markSourceSentToHci).toHaveBeenCalledWith(ORG_ID, "src-1", "hci-src-1");
  });

  it("skips a source already sent (hciSourceId set) without calling HCI-30 again", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail({ hciSourceId: "hci-src-existing" }));

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(client.createHciSeed).not.toHaveBeenCalled();
    expect(summary.alreadyImported).toBe(1);
    expect(summary.imported).toBe(0);
    expect(kb.markSourceSentToHci).not.toHaveBeenCalled();
  });

  it("records a non-'written' outcome (flagged_for_review) as an error, never as a silent success", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());
    client.createHciSeed.mockResolvedValue({ ok: true, value: { outcome: "flagged_for_review", retryable: false, jobId: "job-1", scanReasons: ["injection_suspected"], truncated: false } });

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary.imported).toBe(0);
    expect(summary.errors).toEqual(["src-1:hci_flagged_for_review"]);
    expect(kb.markSourceSentToHci).not.toHaveBeenCalled();
  });

  it("records a failed outcome with its error detail", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());
    client.createHciSeed.mockResolvedValue({ ok: true, value: { outcome: "failed", retryable: true, jobId: "job-1", error: "ssrf_blocked_private_host_literal", errorCode: null } });

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary.errors).toEqual(["src-1:hci_failed:ssrf_blocked_private_host_literal"]);
  });

  it("records a network/call-level failure distinctly from an in-band HCI-30 outcome", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());
    client.createHciSeed.mockResolvedValue({ ok: false, error: "hci_network_error" });

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary.errors).toEqual(["src-1:hci_network_error"]);
    expect(kb.markSourceSentToHci).not.toHaveBeenCalled();
  });

  it("isolates one source's failure -- the rest of the batch still imports", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }, { id: "src-2" }], total: 2, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) =>
      Promise.resolve(detail({ id, canonicalUrl: `https://example.com/${id}` })),
    );
    client.createHciSeed.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith("src-1")
          ? { ok: false, error: "hci_network_error" }
          : { ok: true, value: { outcome: "written", retryable: false, jobId: "job-2", sourceId: "hci-src-2", snapshotId: "snap-2", candidateRelatedSources: [] } },
      ),
    );

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary.imported).toBe(1);
    expect(summary.errors).toEqual(["src-1:hci_network_error"]);
    expect(kb.markSourceSentToHci).toHaveBeenCalledWith(ORG_ID, "src-2", "hci-src-2");
  });

  it("surfaces a write-back failure as a soft warning without un-counting a real import", async () => {
    kb.listKnowledgeSources.mockResolvedValue({ items: [{ id: "src-1" }], total: 1, page: 1, pageSize: 200 });
    kb.getSourceDetail.mockResolvedValue(detail());
    client.createHciSeed.mockResolvedValue({ ok: true, value: { outcome: "written", retryable: false, jobId: "job-1", sourceId: "hci-src-1", snapshotId: "snap-1", candidateRelatedSources: [] } });
    kb.markSourceSentToHci.mockResolvedValue(false);

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(summary.imported).toBe(1); // the send itself genuinely happened -- not un-counted
    expect(summary.errors).toEqual(["write_back_failed:src-1"]);
  });

  it("paginates through more than one page of candidates", async () => {
    kb.listKnowledgeSources
      .mockResolvedValueOnce({ items: [{ id: "src-1" }], total: 201, page: 1, pageSize: 200 })
      .mockResolvedValueOnce({ items: [{ id: "src-2" }], total: 201, page: 2, pageSize: 200 });
    kb.getSourceDetail.mockImplementation((_org: string, id: string) => Promise.resolve(detail({ id })));
    client.createHciSeed.mockResolvedValue({ ok: true, value: { outcome: "written", retryable: false, jobId: "job-x", sourceId: "hci-src-x", snapshotId: "snap-x", candidateRelatedSources: [] } });

    const summary = await importOrganizationSourcesToHci(ORG_ID);

    expect(kb.listKnowledgeSources).toHaveBeenCalledTimes(2);
    expect(summary.totalCandidates).toBe(2);
  });
});
