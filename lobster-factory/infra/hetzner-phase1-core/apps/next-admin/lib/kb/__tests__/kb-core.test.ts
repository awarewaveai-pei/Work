// KB module tests. These live HERE, not in a consumer's test directory, so that extracting
// lib/kb into a standalone service (ADR 011 §決策 3, K4) takes its tests with it.
// Internal imports are intentional: a module's own tests may reach past its public barrel.

import { describe, expect, it } from "vitest";
import { rrfFuse } from "@/lib/kb/rrf";
import { chunkText } from "@/lib/kb/rag";

describe("rrfFuse", () => {
  it("ranks by fused reciprocal rank", () => {
    const fused = rrfFuse([["a", "b", "c"], ["a", "c"]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "c", "b"]);
  });
  it("handles empty input", () => {
    expect(rrfFuse([])).toEqual([]);
  });
});

describe("chunkText", () => {
  it("splits into bounded chunks", () => {
    const body = Array.from({ length: 6 }, (_, i) => `段落 ${i} `.repeat(40)).join("\n\n");
    const chunks = chunkText(body, 500, 80);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(Math.floor(500 * 1.6));
  });
  it("hard-splits an oversize single paragraph", () => {
    const chunks = chunkText("x".repeat(2000), 500, 80);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });
});
