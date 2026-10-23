import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupLedger, liveSpend, monthlyReports, rowsSince, spendKind, summarizeSpend, taipeiDayStartIso, taipeiMonth, taipeiMonthStartIso,
  type SpendRow,
} from "../spend-report";
import { loadSpendRows, MAX_ROWS } from "../spend-loader";

let n = 0;
function row(p: Partial<SpendRow>): SpendRow {
  n += 1;
  return {
    id: `r${n}`, created_at: "2026-10-20T03:00:00+00:00", route: "/cs/generate", model: "claude-haiku-5-5",
    vendor: "Anthropic", cost_usd: 0.01, kind: "text", tool: null, job_id: null, organization_id: null,
    input_tokens: 100, output_tokens: 50, metadata: {}, ...p,
  };
}

// Shape of prod on 2026-10-23: tarot images carry a job_id (the only rows 流水帳 used to show), cs text does not.
const rows: SpendRow[] = [
  row({ route: "tools/tarot/generate", kind: "image", tool: "tarot", job_id: "job-a", cost_usd: "0.003", model: "flux-schnell", vendor: "Replicate", input_tokens: 0, output_tokens: 0 }),
  row({ route: "tools/tarot/generate", kind: "image", tool: "tarot", job_id: "job-a", cost_usd: "0.003", model: "flux-schnell", vendor: "Replicate", input_tokens: 0, output_tokens: 0 }),
  row({ route: "video/motion", kind: "image", tool: "video", job_id: "job-b", cost_usd: 0.25, model: "kling", vendor: "Replicate" }),
  row({ route: "/cs/generate", cost_usd: 0.02, organization_id: "org-1" }),
  row({ route: "/api/content/title", kind: null, cost_usd: 0.002, created_at: "2026-09-30T17:00:00+00:00" }), // = 10-01 01:00 Taipei
  row({ route: "/api/content/title", kind: null, cost_usd: 0.004, created_at: "2026-09-30T15:59:00+00:00" }), // = 09-30 23:59 Taipei
  row({ route: "lib/x", cost_usd: 0, metadata: { rate_fallback: true } }),
];
const total = rows.reduce((s, r) => s + Number(r.cost_usd), 0);

describe("one source of truth: every ledger row is counted in real spend", () => {
  it("ledger groups cover every row exactly once and sum to the real-spend total", () => {
    const groups = groupLedger(rows);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(rows.length);
    expect(ids.length).toBe(rows.length);
    expect(groups.reduce((s, g) => s + g.totalUsd, 0)).toBeCloseTo(summarizeSpend(rows).totalUsd, 9);
    expect(summarizeSpend(rows).totalUsd).toBeCloseTo(total, 9);
  });

  it("image rows logged with a job_id show up in the image bucket, not as text", () => {
    const s = summarizeSpend(rows);
    const image = s.byKind.find((b) => b.key === "image");
    expect(image?.count).toBe(2);
    expect(image?.usd).toBeCloseTo(0.006, 9);
    expect(s.byKind.find((b) => b.key === "video")?.usd).toBeCloseTo(0.25, 9);
  });

  it("every breakdown sums to the same total and the same row count", () => {
    const s = summarizeSpend(rows);
    for (const b of [s.byKind, s.byVendor, s.byModel, s.byTool, s.byRoute, s.byOrg]) {
      expect(b.reduce((x, y) => x + y.usd, 0)).toBeCloseTo(s.totalUsd, 9);
      expect(b.reduce((x, y) => x + y.count, 0)).toBe(s.count);
    }
  });

  it("calls without a job_id are their own ledger line, not dropped", () => {
    const g = groupLedger(rows).filter((x) => !x.isJob);
    expect(g.length).toBe(4);
    expect(g.every((x) => x.rows.length === 1)).toBe(true);
  });

  it("a window filter applied to both views keeps them equal", () => {
    const w = rowsSince(rows, "2026-10-01T00:00:00.000Z");
    expect(groupLedger(w).reduce((s, g) => s + g.totalUsd, 0)).toBeCloseTo(summarizeSpend(w).totalUsd, 9);
    expect(w.length).toBe(rows.length - 2);
  });

  it("flags fallback-priced and zero-cost rows instead of hiding them", () => {
    const s = summarizeSpend(rows);
    expect(s.fallbackPricedCount).toBe(1);
    expect(s.zeroCostCount).toBe(1);
  });
});

describe("monthly report", () => {
  it("buckets by Asia/Taipei calendar month and months add up to the whole", () => {
    expect(taipeiMonth("2026-09-30T17:00:00+00:00")).toBe("2026-10");
    expect(taipeiMonth("2026-09-30T15:59:00+00:00")).toBe("2026-09");
    const months = monthlyReports(rows);
    expect(months.map((m) => m.month)).toEqual(["2026-10", "2026-09"]);
    expect(months.reduce((s, m) => s + m.summary.totalUsd, 0)).toBeCloseTo(total, 9);
    expect(months[1].summary.totalUsd).toBeCloseTo(0.004, 9);
  });

  it("month start is 00:00 Taipei on the 1st", () => {
    expect(taipeiMonthStartIso(new Date("2026-10-23T10:00:00Z"), 0)).toBe("2026-09-30T16:00:00.000Z");
    expect(taipeiMonthStartIso(new Date("2026-10-23T10:00:00Z"), 11)).toBe("2025-10-31T16:00:00.000Z");
  });

  it("spendKind: NULL kind is text, video route is video", () => {
    expect(spendKind({ kind: null, route: "/api/content/title" })).toBe("text");
    expect(spendKind({ kind: "image", route: "video/motion" })).toBe("video");
  });
});

describe("live monitoring (真實花費)", () => {
  // 2026-10-23 12:00 Taipei; month started 2026-10-01 00:00 Taipei = 09-30T16:00Z.
  const now = new Date("2026-10-23T04:00:00Z");
  const at = (iso: string, usd: number, p: Partial<SpendRow> = {}) => row({ created_at: iso, cost_usd: usd, ...p });
  const live = [
    at("2026-09-15T02:00:00+00:00", 3),                       // previous month
    at("2026-09-30T15:30:00+00:00", 1),                       // 09-30 23:30 Taipei → September
    at("2026-09-30T16:30:00+00:00", 0.1),                     // 10-01 00:30 Taipei → October
    at("2026-10-20T01:00:00+00:00", 0.1, { route: "/cs/generate" }),
    at("2026-10-22T16:10:00+00:00", 0.9, { route: "/cs/generate" }),   // today 00:10 Taipei
    at("2026-10-22T15:50:00+00:00", 0.05),                    // yesterday 23:50 Taipei
  ];
  const l = liveSpend(live, now);

  it("today / 7 days / month-to-date use Taipei days", () => {
    expect(l.today.usd).toBeCloseTo(0.9, 9);
    expect(l.last7.usd).toBeCloseTo(1.05, 9);
    expect(l.monthToDate.usd).toBeCloseTo(1.15, 9);
    expect(l.month).toBe("2026-10");
    expect(l.prevMonth).toEqual({ month: "2026-09", usd: 4 });
  });

  it("projects month-end linearly from the elapsed fraction", () => {
    const elapsed = (now.getTime() - Date.parse("2026-09-30T16:00:00Z")) / (31 * 86400_000);
    expect(l.projectedMonthUsd).toBeCloseTo(1.15 / elapsed, 9);
  });

  it("daily covers 30 days ending today and sums to the same window the ledger uses", () => {
    expect(l.daily.length).toBe(30);
    expect(l.daily.at(-1)?.day).toBe("2026-10-23");
    expect(l.daily[0].day).toBe("2026-09-24");
    const windowRows = rowsSince(live, taipeiDayStartIso(now, 29));
    expect(l.last30.usd).toBeCloseTo(summarizeSpend(windowRows).totalUsd, 9);
    expect(groupLedger(windowRows).reduce((s, g) => s + g.totalUsd, 0)).toBeCloseTo(l.last30.usd, 9);
  });

  it("flags today's spike for a day and for a route, and nothing on a quiet history", () => {
    expect(l.anomalies.some((a) => a.type === "day_spike" && a.day === "2026-10-23")).toBe(true);
    expect(l.anomalies.some((a) => a.type === "route_spike" && a.route === "/cs/generate")).toBe(true);
    const quiet = liveSpend([at("2026-10-22T16:10:00+00:00", 0.1)], now);
    expect(quiet.anomalies).toEqual([]);
  });

  it("top routes compare the last 7 days with the 7 before", () => {
    const t = l.topRoutes7.find((r) => r.route === "/cs/generate");
    expect(t?.usd).toBeCloseTo(1.05, 9); // 0.1 + 0.9 + 0.05 (row() defaults to /cs/generate)
    expect(t?.prevUsd).toBe(0);
  });
});

describe("loadSpendRows pages past the server row cap", () => {
  function fakeClient(all: SpendRow[], cap: number) {
    const calls: [number, number][] = [];
    const q = {
      select: () => q, gte: () => q, order: () => q,
      range: (a: number, b: number) => {
        calls.push([a, b]);
        return Promise.resolve({ data: all.slice(a, Math.min(b + 1, a + cap)), error: null });
      },
    };
    return { client: { from: () => q } as unknown as SupabaseClient, calls };
  }

  it("returns every row even when the cap is below the page size", async () => {
    const all = Array.from({ length: 2345 }, () => row({}));
    const { client } = fakeClient(all, 700);
    const out = await loadSpendRows(client, "2026-01-01T00:00:00Z");
    expect(out.rows.length).toBe(2345);
    expect(out.truncated).toBe(false);
  });

  it("flags truncation only when a row exists past the cap", async () => {
    const exact = Array.from({ length: MAX_ROWS }, () => row({}));
    expect((await loadSpendRows(fakeClient(exact, 1000).client, "2026-01-01T00:00:00Z")).truncated).toBe(false);
    const over = [...exact, row({})];
    const res = await loadSpendRows(fakeClient(over, 1000).client, "2026-01-01T00:00:00Z");
    expect(res.truncated).toBe(true);
    expect(res.rows.length).toBe(MAX_ROWS);
  });
});
