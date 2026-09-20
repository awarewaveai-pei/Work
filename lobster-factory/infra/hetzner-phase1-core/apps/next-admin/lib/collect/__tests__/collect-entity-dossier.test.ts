// The dossier block and its query plan. No network: ctx.callProvider is the seam.
//
// What these pin down is the three ways this differs from a search source, because each of them is
// a thing that silently reverts to "web-search with extra steps" if somebody edits it without
// knowing why it is there: many angles per entity, results as roots that are never followed, and
// an entity assertion stamped on every result for the relevance gate to test.

import { describe, expect, it, vi } from "vitest";
import {
  anglesFromMeta,
  entityDossierCollector,
  entityNameOf,
  entityRefFromMeta,
  ENTITY_SCHEME,
} from "@/lib/collect/collectors/entity-dossier";
import { ANGLES, DEFAULT_ANGLES, MAX_QUERIES, buildQueryPlan, defaultLanguagesFor, parseLanguages } from "@/lib/collect/search/query-plan";
import { CollectFetchError } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";
import { canonicalize } from "@/lib/collect/canonical";
import type { CollectCtx, Target } from "@/lib/collect/types";

function target(name: string, meta: Record<string, unknown> = {}): Target {
  const uri = `${ENTITY_SCHEME}://${encodeURIComponent(name)}`;
  return { uri, canonicalUri: uri, scope: { hosts: [] }, tier: 0, depth: 0, meta };
}

function ctxWith(results: Record<string, Array<{ title: string; link: string; snippet?: string }>>, log: string[] = []): CollectCtx {
  return {
    fetch: (async () => new Response("")) as never,
    callProvider: vi.fn(async (_id, init) => {
      const q = String((init.body as { q?: string })?.q ?? "");
      return new Response(JSON.stringify({ organic: results[q] ?? results["*"] ?? [] }), {
        headers: { "content-type": "application/json" },
      });
    }),
    canonicalize,
    budget: createBudget(),
    tenantRef: "t1",
    log: (m) => log.push(m),
  };
}

describe("buildQueryPlan", () => {
  const base = { name: "Theo Farrell", kind: "person" as const, anchors: ["La Trobe"], aliases: [], languages: ["zh", "en"] as const };

  it("turns one name into one query per angle per language", () => {
    const plan = buildQueryPlan({ ...base, languages: [...base.languages], angleIds: ["identity", "news"] });
    expect(plan).toHaveLength(4);
    expect(plan.map((p) => p.lang)).toEqual(["zh", "en", "zh", "en"]);
  });

  it("quotes the name — an unquoted two-word name matches pages containing either word", () => {
    const plan = buildQueryPlan({ ...base, languages: ["en"], angleIds: ["identity"] });
    expect(plan[0].query).toContain('"Theo Farrell"');
  });

  it("substitutes the first anchor, and reads correctly when there is none", () => {
    const withAnchor = buildQueryPlan({ ...base, languages: ["en"], angleIds: ["identity"] })[0].query;
    const without = buildQueryPlan({ ...base, anchors: [], languages: ["en"], angleIds: ["identity"] })[0].query;
    expect(withAnchor).toContain("La Trobe");
    expect(without).not.toContain("  ");
    expect(without.trim()).toBe(without);
  });

  it("gives an alias one query, not a whole second plan", () => {
    const plan = buildQueryPlan({ ...base, languages: ["en"], angleIds: ["identity", "news"], aliases: ["費瑟羅"] });
    expect(plan.filter((p) => p.angle === "alias")).toHaveLength(1);
  });

  it("never exceeds the billed-call ceiling", () => {
    const plan = buildQueryPlan({
      ...base,
      languages: [...base.languages],
      angleIds: ANGLES.person.map((a) => a.id),
      aliases: ["a", "b", "c", "d", "e"],
    });
    expect(plan.length).toBeLessThanOrEqual(MAX_QUERIES);
  });

  it("truncates by angle, not by language — every angle survives before a second language does", () => {
    const plan = buildQueryPlan({
      ...base,
      languages: [...base.languages],
      angleIds: ANGLES.company.map((a) => a.id),
      kind: "company",
    });
    const zhAngles = plan.filter((p) => p.lang === "zh").map((p) => p.angle);
    expect(new Set(zhAngles).size).toBe(ANGLES.company.length);
  });

  it("pays for a query once when two angles collapse to the same string", () => {
    const plan = buildQueryPlan({ ...base, anchors: [], languages: ["zh"], angleIds: ["news", "news"] });
    expect(plan).toHaveLength(1);
  });

  it("is empty for an empty name rather than searching for the anchor alone", () => {
    expect(buildQueryPlan({ ...base, name: "   ", languages: ["zh"], angleIds: ["identity"] })).toEqual([]);
  });

  it("every declared angle has at least one template in some language", () => {
    for (const kind of Object.keys(ANGLES) as Array<keyof typeof ANGLES>) {
      for (const angle of ANGLES[kind]) {
        expect(Object.keys(angle.templates).length, `${kind}/${angle.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("every default angle id actually exists in its kind", () => {
    for (const kind of Object.keys(DEFAULT_ANGLES) as Array<keyof typeof DEFAULT_ANGLES>) {
      for (const id of DEFAULT_ANGLES[kind]) {
        expect(ANGLES[kind].some((a) => a.id === id), `${kind}/${id}`).toBe(true);
      }
    }
  });
});

describe("parseLanguages", () => {
  it("keeps only languages there are templates for", () => {
    expect(parseLanguages("zh, en, klingon")).toEqual(["zh", "en"]);
    expect(parseLanguages(42)).toEqual([]);
  });
});

describe("language default follows the NAME, not the operator's locale", () => {
  it("searches English only for a Latin-script name", () => {
    // Chinese queries for a Latin-named foreigner returned a Wuhan university notice, a Taiwanese
    // thesis index and an alumni bulletin — four documents, no facts, billed twice (2026-09-20).
    expect(defaultLanguagesFor("Theo Farrell")).toEqual(["en"]);
  });

  it("searches both for a CJK name — the English coverage is the part you cannot find by hand", () => {
    expect(defaultLanguagesFor("王大明")).toEqual(["zh", "en"]);
    expect(defaultLanguagesFor("覺浪股份有限公司")).toEqual(["zh", "en"]);
  });
});

describe("entityRefFromMeta / anglesFromMeta", () => {
  it("reads the name out of the entity:// uri", () => {
    expect(entityNameOf(target("Theo Farrell"))).toBe("Theo Farrell");
  });

  it("defaults to person and to strict anchors", () => {
    const ref = entityRefFromMeta(target("X"));
    expect(ref.kind).toBe("person");
    expect(ref.strictAnchors).toBe(true);
  });

  it("falls back to the kind's defaults when the operator ticked nothing", () => {
    expect(anglesFromMeta("company", "")).toEqual(DEFAULT_ANGLES.company);
  });

  it("drops an angle id that does not belong to the chosen kind", () => {
    // "registration" is a company angle; asking for it on a person must not produce a dead query.
    expect(anglesFromMeta("person", "identity,registration")).toEqual(["identity"]);
  });

  it("reads namespaced ids, so person·新聞 and 公司·新聞 are two separate checkboxes", () => {
    // Both kinds declare `identity` and `news`. Unnamespaced, one tick toggled two boxes.
    expect(anglesFromMeta("person", "person:identity,person:news")).toEqual(["identity", "news"]);
    expect(anglesFromMeta("person", "company:identity")).toEqual(DEFAULT_ANGLES.person);
  });

  it("still accepts bare ids written before namespacing, rather than silently defaulting", () => {
    expect(anglesFromMeta("company", "registration,legal")).toEqual(["registration", "legal"]);
  });
});

describe("entityDossierCollector.run", () => {
  const meta = { kind: "person", anchors: "La Trobe", angles: "identity", languages: "en", maxResultsPerQuery: 5 };

  it("returns the results as roots that are read but never followed", async () => {
    const ctx = ctxWith({ "*": [{ title: "About", link: "https://latrobe.edu.au/vc" }] });
    const { docs, discovered } = await entityDossierCollector.run(target("Theo Farrell", meta), ctx);

    expect(docs).toEqual([]); // a vendor snippet is never stored as content
    expect(discovered).toHaveLength(1);
    expect(discovered[0].depth).toBe(0);
    expect(discovered[0].meta?.maxDepth).toBe(0);
    expect(discovered[0].scope).toEqual({ hosts: ["latrobe.edu.au"] });
  });

  it("stamps the entity assertion the relevance gate will test each page against", async () => {
    const ctx = ctxWith({ "*": [{ title: "About", link: "https://latrobe.edu.au/vc" }] });
    const { discovered } = await entityDossierCollector.run(target("Theo Farrell", meta), ctx);

    expect(discovered[0].meta?.entity).toMatchObject({
      name: "Theo Farrell",
      kind: "person",
      anchors: ["La Trobe"],
      strictAnchors: true,
    });
  });

  it("files every angle under the ENTITY, so one dossier is one folder", async () => {
    const ctx = ctxWith({
      "*": [{ title: "a", link: "https://a.example/1" }],
    });
    const { discovered } = await entityDossierCollector.run(
      target("Theo Farrell", { ...meta, angles: "identity,news" }),
      ctx,
    );
    expect(new Set(discovered.map((d) => d.meta?.searchQuery))).toEqual(new Set(["Theo Farrell"]));
  });

  it("de-duplicates the same page returned by two different angles", async () => {
    const ctx = ctxWith({ "*": [{ title: "profile", link: "https://latrobe.edu.au/vc?utm_source=x" }] });
    const { discovered } = await entityDossierCollector.run(
      target("Theo Farrell", { ...meta, angles: "identity,news,works" }),
      ctx,
    );
    expect(discovered).toHaveLength(1);
  });

  it("keeps what earlier queries found when the budget runs out mid-plan", async () => {
    let call = 0;
    const ctx = ctxWith({ "*": [] });
    ctx.callProvider = vi.fn(async () => {
      call++;
      if (call > 1) throw new CollectFetchError("budget exhausted", "budget");
      return new Response(JSON.stringify({ organic: [{ title: "a", link: "https://a.example/1" }] }), {
        headers: { "content-type": "application/json" },
      });
    });

    const { discovered } = await entityDossierCollector.run(
      target("Theo Farrell", { ...meta, angles: "identity,news,works" }),
      ctx,
    );

    // Thrown away, the already-billed first query would be paid for twice on the resumed run.
    expect(discovered).toHaveLength(1);
  });

  it("lets one failing angle fail alone", async () => {
    let call = 0;
    const ctx = ctxWith({ "*": [] });
    ctx.callProvider = vi.fn(async () => {
      call++;
      if (call === 1) throw Object.assign(new Error("bad operator"), { status: 400 });
      return new Response(JSON.stringify({ organic: [{ title: "a", link: `https://a.example/${call}` }] }), {
        headers: { "content-type": "application/json" },
      });
    });

    const { discovered } = await entityDossierCollector.run(
      target("Theo Farrell", { ...meta, angles: "identity,news,works" }),
      ctx,
    );

    expect(discovered).toHaveLength(2);
  });

  it("drops a bookshop listing before paying to fetch it", async () => {
    const ctx = ctxWith({
      "*": [
        { title: "Theo Farrell: Books", link: "https://www.amazon.com/-/zh_TW/Theo-Farrell/dp/1555879756" },
        { title: "Theo Farrell", link: "https://www.penguin.com.au/authors/theo-farrell" },
        { title: "Vice-Chancellor", link: "https://www.latrobe.edu.au/vc" },
      ],
    });
    const { discovered } = await entityDossierCollector.run(target("Theo Farrell", meta), ctx);

    expect(discovered.map((d) => d.uri)).toEqual(["https://www.latrobe.edu.au/vc"]);
    expect(discovered[0].meta?.sourceClass).toBe("unknown");
  });

  it("collects the shops when the operator explicitly asks for them", async () => {
    const ctx = ctxWith({ "*": [{ title: "Books", link: "https://www.amazon.com/dp/1555879756" }] });
    const { discovered } = await entityDossierCollector.run(
      target("Theo Farrell", { ...meta, includeShops: true }),
      ctx,
    );
    expect(discovered).toHaveLength(1);
  });

  it("refuses to run without a name rather than searching for the anchors", async () => {
    await expect(entityDossierCollector.run(target("   ", meta), ctxWith({ "*": [] }))).rejects.toThrow(
      /entity_name_missing/,
    );
  });
});
