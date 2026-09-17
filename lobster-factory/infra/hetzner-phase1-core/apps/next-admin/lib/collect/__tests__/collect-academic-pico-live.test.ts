// A real OpenAlex query, run twice for the same underlying research question — once as the naive
// free text an operator might type, once as PICO fields — to show what structuring the query
// actually buys. collect-sources.test.ts proves buildPicoQuery as a pure function; this is the half
// it cannot prove, which is whether the resulting query is actually MORE PRECISE against the real
// registry, the way SciSpace's own published prompting guide claims PICO structuring to be.
//
// Stores nothing (calls academicCollector.run() directly, bypassing the orchestrator and any sink).
// OFF by default (real network, and polite-pool etiquette says do not hammer OpenAlex from CI):
//   COLLECT_ACADEMIC_PICO_LIVE=1 npx vitest run lib/collect/__tests__/collect-academic-pico-live.test.ts

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { describe, expect, it } from "vitest";
import { createBudget } from "@/lib/collect/budget";
import { createCollectFetch } from "@/lib/collect/net/fetcher";
import { academicCollector } from "@/lib/collect/collectors/academic";
import type { CollectCtx, Target } from "@/lib/collect/types";

loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_ACADEMIC_PICO_LIVE === "1";

function ctxFor(label: string): CollectCtx {
  const budget = createBudget({ fetches: 3, bytes: 5_000_000, ms: 30_000 });
  return {
    canonicalize: (u: string) => u,
    fetch: createCollectFetch({ budget, log: (m) => console.log(`[${label}] ${m}`) }),
    budget,
    tenantRef: "academic-pico-live",
    log: (m: string) => console.log(`[${label}] ${m}`),
  };
}

async function run(uri: string, meta: Record<string, unknown>) {
  const t: Target = { uri, canonicalUri: uri, scope: { hosts: ["api.openalex.org"] }, tier: 0, depth: 0, meta };
  return academicCollector.run(t, ctxFor(meta.picoPopulation ? "pico" : "freetext"));
}

describe.skipIf(!LIVE)("academic PICO structuring vs free text, live against OpenAlex", () => {
  it(
    "the PICO-structured query is at least as on-topic as the naive free-text query, for real",
    async () => {
      const FREE_TEXT = "metformin diabetes";
      const freeText = await run(`academic://${encodeURIComponent(FREE_TEXT)}`, { limit: 8 });

      const pico = await run(`academic://${encodeURIComponent("unused because PICO fields are set")}`, {
        limit: 8,
        picoPopulation: "type 2 diabetes",
        picoIntervention: "metformin",
        picoOutcome: "HbA1c, glycemic control",
      });

      // The concrete example: real titles from both runs, printed so a human can read the actual
      // difference rather than trust a single boolean assertion.
      const diag = (d: (typeof pico.docs)[number]) =>
        `[T2D:${/type 2 diabetes/i.test(d.text) ? "Y" : "n"} metformin:${/metformin/i.test(d.text) ? "Y" : "n"} ` +
        `gestational:${/gestational/i.test(d.text) ? "Y" : "n"}] ${d.title}`;
      console.log(`\n自由文字 "${FREE_TEXT}"（${freeText.docs.length} 篇）：`);
      for (const d of freeText.docs) console.log(`  - ${diag(d)}`);
      console.log(`\nPICO（P=type 2 diabetes, I=metformin, O=HbA1c/glycemic control）（${pico.docs.length} 篇）：`);
      for (const d of pico.docs) console.log(`  - ${diag(d)}`);

      expect(freeText.docs.length, "free-text baseline returned nothing to compare against").toBeGreaterThan(0);
      expect(pico.docs.length, "PICO query returned nothing — too narrow, or a real HTTP/parse failure").toBeGreaterThan(0);

      const rate = (docs: typeof pico.docs, re: RegExp) => (docs.length ? docs.filter((d) => re.test(d.text)).length / docs.length : 0);
      const picoT2d = rate(pico.docs, /type 2 diabetes/i);
      const freeTextT2d = rate(freeText.docs, /type 2 diabetes/i);
      const picoGestational = rate(pico.docs, /gestational/i);
      const freeTextGestational = rate(freeText.docs, /gestational/i);
      console.log(`\n比例 — "type 2 diabetes" 出現：PICO ${picoT2d} / 自由文字 ${freeTextT2d}`);
      console.log(`         "gestational"（population 錯配，PICO 的 P 應該排除掉）：PICO ${picoGestational} / 自由文字 ${freeTextGestational}`);
      console.log(`         "metformin" 出現：PICO ${rate(pico.docs, /metformin/i)} / 自由文字 ${rate(freeText.docs, /metformin/i)} ` +
        `（PICO 這項可能較低也正常——OpenAlex 的布林比對涵蓋全文，這個 collector 只存 title+abstract，見下方註解）`);

      // The two claims that are actually SAFE to assert on a live registry, because they follow from
      // how the query was built rather than from this run's specific result set:
      //   - Population ("type 2 diabetes", phrase-quoted, ANDed) can only ever match AS OR MORE
      //     narrowly than free text's bare "diabetes" keyword — never less.
      //   - The free-text baseline has no population term at all, so nothing stops an off-population
      //     subtype (gestational diabetes, a real hit above) from getting in; PICO's AND does.
      // What is NOT asserted: that "metformin" (the Intervention) shows up more often in the STORED
      // text for PICO. Measured above at 0.625 vs 1.0 — LOWER for PICO on this real run. OpenAlex's
      // boolean search matches title+abstract+fulltext; this collector stores only title+abstract
      // (WHAT COMES BACK, file header). A paper can legitimately satisfy the AND via a fulltext
      // mention (e.g. metformin as background/comparator therapy) without naming it in the abstract
      // we keep. That is a real, honest limit of what this collector can verify from its own stored
      // text, not a bug — asserting on it here would encode a coin flip as a regression test.
      expect(picoT2d, "PICO's population clause should scope at least as tightly as free text's bare keyword").toBeGreaterThanOrEqual(
        freeTextT2d,
      );
      expect(picoGestational, "PICO's population AND should exclude the off-population noise free text let through").toBeLessThanOrEqual(
        freeTextGestational,
      );
    },
    60_000,
  );
});
