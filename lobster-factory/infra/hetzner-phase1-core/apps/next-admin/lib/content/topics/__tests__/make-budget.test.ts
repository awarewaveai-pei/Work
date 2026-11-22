// N2 through the real makeDrafts: a failed attempt keeps none of its own reservations, so a retry is checked against the
// ledger only (Codex 2026-11-19 r4: a WordPress failure after the article held its NT$6 reservation and blocked the retry).
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ pipeline: vi.fn(), ledger: [] as Array<{ cost_usd: number }> }));
vi.mock("@/lib/entitlements/grant", () => ({ runForOrg: (_o: string, _a: string, fn: () => unknown) => fn(), grantFor: async () => ({}) }));
vi.mock("@/lib/content/brand-voice-store", () => ({ loadSiteBrand: async () => ({ organizationId: "org1", defaults: {} }) }));
vi.mock("@/lib/storage/r2", () => ({ isR2Configured: () => false }));
vi.mock("@/lib/content/pipeline", () => ({ runContentPipeline: m.pipeline }));

import { topicDeps } from "../make";
import { MakeError } from "../tick";
import type { Topic } from "../store";
vi.stubEnv("OPENAI_API_KEY", ""); // these tests drive the Anthropic stub: no OpenAI key -> the article default falls back to Claude (K15)

// ai_call_logs as PostgREST pages it: at most 2 rows a response here, so a read that stops after one page undercounts
type Q = { eq: () => Q; gte: () => Q; order: () => Q; range: (from: number) => Promise<{ data: unknown[]; error: null }> };
const rows = (): Q => ({ eq: rows, gte: rows, order: rows, range: async (from: number) => ({ data: m.ledger.slice(from, from + 2), error: null }) });
const sb = { from: () => ({ select: rows }) };
const topic = (artifacts: Record<string, unknown> = {}): Topic => ({
  id: "11111111-1111-4111-8111-111111111111", organization_id: "org1", site_id: "s1", title: "t", keyword: "k", angle: null,
  source: "manual", source_ref: {}, month: "2026-11-01", scheduled_for: null, formats: ["article"], status: "generating",
  artifacts, review: null, version: 1, last_error: null, started_on: null, created_by: "x", created_at: "", updated_at: "",
});

describe("topic cap across attempts", () => {
  it("a WordPress failure after the article was paid does not hold the article's reservation against the retry", async () => {
    const deps = topicDeps(sb as never, "org1", "staff:x", { capTwd: 10 });
    m.pipeline.mockResolvedValueOnce({ ok: true, markdown: "# 文章" })                                   // the article call
      .mockResolvedValueOnce({ ok: false, failedStage: "publish", error: "WP 500" });                    // the WordPress draft
    const err = await deps.make(topic()).catch((e) => e);
    expect(err).toBeInstanceOf(MakeError);
    expect((err.artifacts as { budget: { spentTwd: number } }).budget.spentTwd).toBe(0);
    m.ledger.push({ cost_usd: 0.03 });   // what the article call was really billed (~NT$1) reached the ledger
    m.pipeline.mockResolvedValueOnce({ ok: true, markdown: "# 文章" }).mockResolvedValueOnce({ ok: false, failedStage: "publish", error: "WP 500" });
    const again = await deps.make(topic(err.artifacts)).catch((e) => e);
    expect(again.message).toBe("WordPress 草稿失敗（publish）：WP 500");   // checked and made again, not stopped at the cap
  });

  it("every page of the ledger counts: spend past the first page still stops the next step at the cap", async () => {
    m.ledger.length = 0;
    m.ledger.push({ cost_usd: 0.1 }, { cost_usd: 0.1 }, { cost_usd: 0.1 });   // ~NT$9.6 over two pages (the article step reserves ~NT$2 more, so the cap stops it); one page ~NT$6.4 would not
    const deps = topicDeps(sb as never, "org1", "staff:x", { capTwd: 10 });
    const err = await deps.make(topic()).catch((e) => e);
    expect(err.message).toMatch(/^這一題花到上限 NT\$10，停在〈文章〉/);
  });
});
