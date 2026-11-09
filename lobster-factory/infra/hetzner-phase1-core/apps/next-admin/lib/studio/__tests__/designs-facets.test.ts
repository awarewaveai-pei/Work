// My Designs went 500 on roughly 2 of every 5 loads (2026-11-09): `[designs] list failed: count failed:` with an empty
// body. Cause: counting sent one COUNT request per facet value — about 40 per page load, growing with the model catalog —
// and the host's nginx allows 30 req/s per IP with a burst of 50 on supabase.aware-wave.com, so a page that loaded twice
// crossed it and got 429s. Counting now scans the scope once and tallies in memory, so one page load is one request.
// These tests pin the tally against the predicates applyFilters applies in the DB; drift between them is the real risk.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FACET_SCAN_MAX, productOf } from "../designs-list";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "designs-list.ts"), "utf8");

describe("facet counting does not fan out", () => {
  it("counting is a scan, not one request per key", () => {
    // The old shape: countWhere / countMap / distinctValues, one HEAD per key and up to 50 one-row probes per dimension.
    expect(SRC).not.toContain("async function countWhere");
    expect(SRC).not.toContain("async function countMap");
    expect(SRC).not.toContain("async function distinctValues");
    expect(SRC).toContain("async function scanScope");
    // head:true count requests are what the burst was made of; the list query uses none.
    expect(SRC).not.toContain("head: true");
  });

  it("the scan is bounded, so a large scope cannot turn one page load into a long walk", () => {
    expect(FACET_SCAN_MAX).toBeGreaterThan(1000);
    expect(SRC).toContain("out.length < FACET_SCAN_MAX");
  });

  it("productOf is the inverse of applyProduct, so chip counts match what clicking a chip filters", () => {
    const row = (source: string | null, productType: string | null = null) =>
      ({ created_at: "2026-11-09T00:00:00Z", source, model: null, productType, theme: null, brand: null });
    // applyProduct: TAROT_SOURCES → tarot-card; MOCKUP_SOURCES → mockup-composite; pod-studio → its product_type.
    expect(productOf(row("tarot"))).toBe("tarot-card");
    expect(productOf(row("tarot-preview-edit"))).toBe("tarot-card");
    expect(productOf(row("mockup"))).toBe("mockup-composite");
    expect(productOf(row("pod-studio", "tshirt"))).toBe("tshirt");
    expect(productOf(row("pod-studio", null))).toBeNull();
    expect(productOf(row("canvas"))).toBeNull();
    expect(productOf(row(null))).toBeNull();
  });

  it("every product branch of applyProduct has a productOf branch", () => {
    const applyProduct = SRC.slice(SRC.indexOf("function applyProduct"), SRC.indexOf("/** Every list predicate"));
    for (const key of ["tarot-card", "mockup-composite", "pod-studio"]) expect(applyProduct, key).toContain(key);
    const inverse = SRC.slice(SRC.indexOf("export function productOf"), SRC.indexOf("async function scanScope"));
    for (const key of ["tarot-card", "mockup-composite", "pod-studio"]) expect(inverse, key).toContain(key);
  });
});
