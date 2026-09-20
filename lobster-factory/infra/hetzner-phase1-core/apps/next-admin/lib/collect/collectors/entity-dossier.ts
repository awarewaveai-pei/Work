// collect/entity-dossier — 給一個人／一間公司／一個事件，把關於它的背景資料收齊。
//
// WHAT THIS IS NOT: collect/web-search with more queries. The difference is the unit of work. A
// search source's unit is A QUESTION, and its answer is whatever pages the engine names. This
// source's unit is AN ENTITY, and its answer has to satisfy one invariant the other cannot state:
// every document in the folder is about that entity. Three things follow, and none of them fits
// inside a query box:
//
//   1. ONE NAME IS NOT ONE SEARCH. Background research is eight or nine searches from different
//      angles — who is this, where do they work, what have they written, what went wrong. A source
//      that runs one of them has moved the other eight back onto the operator. The angles are data
//      (lib/collect/search/query-plan.ts), ticked in the UI, not code.
//   2. THE RESULTS ARE ROOTS, NOT ENTRY POINTS. Each one is read and nothing is followed from it
//      (`maxDepth: 0`). A bookshop's author page is a page about the author; the bookshop is not
//      about the author. Run manual-2026-09-20051728 crawled 159 pages of penguin.com.au's browse
//      catalogue off exactly this mistake.
//   3. NAMES ARE NOT UNIQUE. "Theo Farrell" is a vice-chancellor, an Instagram account, and a
//      different author in a bookshop's catalogue. The operator's anchors decide which one, and
//      lib/collect/relevance.ts refuses the rest — that gate reads meta.entity, which is stamped
//      here.
//
// STORES NOTHING ITSELF, exactly like collect/web-search: it turns an entity into result URLs and
// hands them back, so each page is fetched, extracted, graded, screened and stamped by the normal
// tier. A vendor's three-line snippet stored as content would be an unverifiable paraphrase with a
// real URL attached — the most convincing kind of wrong.

import type { CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { providerConfigured } from "@/lib/collect/net/providers";
import { CollectFetchError } from "@/lib/collect/net/fetcher";
import {
  SEARCH_DRIVERS,
  SEARCH_KEYS,
  domainFilter,
  searchProviderId,
  usableResults,
} from "@/lib/collect/search/drivers";
import {
  ANGLES,
  DEFAULT_ANGLES,
  MAX_QUERIES,
  buildQueryPlan,
  parseLanguages,
  type PlannedQuery,
} from "@/lib/collect/search/query-plan";
import { isEntityKind, parseTermList, type EntityKind, type EntityRef } from "@/lib/collect/entity";

export const ENTITY_SCHEME = "entity";

/** The entity name the source was configured with. */
export function entityNameOf(t: Target): string {
  if (typeof t.meta?.entityName === "string" && t.meta.entityName.trim()) return t.meta.entityName.trim();
  // Trimmed: an entry of spaces would otherwise be a truthy name that produces no queries, and the
  // source would report a clean run having done nothing at all.
  if (t.uri.startsWith(`${ENTITY_SCHEME}://`)) return decodeURIComponent(t.uri.slice(`${ENTITY_SCHEME}://`.length)).trim();
  return "";
}

/**
 * Build the EntityRef from the source's options.
 *
 * `strictAnchors` defaults to ON, and only ever matters when anchors were actually given: an
 * operator who typed "La Trobe" is naming which Theo Farrell they mean, and admitting the others
 * anyway spends their attention on exactly what they were excluding.
 */
export function entityRefFromMeta(t: Target): EntityRef {
  const meta = t.meta ?? {};
  const kind: EntityKind = isEntityKind(meta.kind) ? meta.kind : "person";
  return {
    name: entityNameOf(t),
    kind,
    anchors: parseTermList(meta.anchors),
    aliases: parseTermList(meta.aliases, 5),
    strictAnchors: meta.strictAnchors !== false,
  };
}

/** Angle ids the operator ticked, falling back to the defaults for this entity kind. */
export function anglesFromMeta(kind: EntityKind, value: unknown): string[] {
  const chosen = parseTermList(value, MAX_QUERIES).filter((id) => ANGLES[kind].some((a) => a.id === id));
  return chosen.length ? chosen : DEFAULT_ANGLES[kind];
}

const KIND_CHOICES = [
  { value: "person", label: "人（個人背景）" },
  { value: "company", label: "公司／組織" },
  { value: "event", label: "事件" },
];

/**
 * Angle choices for the UI. Every kind's angles are listed together, prefixed, because the option
 * schema is static while the chosen kind is not — and a box that silently changes its contents
 * after the operator ticked things is worse than a longer list.
 */
const ANGLE_CHOICES = (Object.keys(ANGLES) as EntityKind[]).flatMap((kind) =>
  ANGLES[kind].map((a) => ({ value: a.id, label: `${KIND_CHOICES.find((k) => k.value === kind)!.label.slice(0, 2)}·${a.label}` })),
);

export const entityDossierCollector: CollectBlock = {
  id: "collect/entity-dossier",
  title: "背景調查（人／公司／事件）",
  icon: "🕵️",

  describe: {
    kind: "web",
    summary:
      "給一個人名／公司名／事件名，自動從多個角度搜尋，逐頁抓回原文，並丟掉不是講這個對象的頁面。存進知識庫的是頁面原文與出處。按查詢次數計費。",
    entry: "query",
    queryScheme: ENTITY_SCHEME,
    requiresAny: [...SEARCH_KEYS],
    metered: true,
    options: [
      {
        key: "kind",
        label: "對象類型",
        type: "select",
        default: "person",
        choices: KIND_CHOICES,
        help: "決定用哪一組搜尋角度。",
      },
      {
        key: "anchors",
        label: "定位詞（同名的人怎麼分辨）",
        type: "string",
        help: "逗號分隔，例如：La Trobe, 校長, 戰爭研究。這是最重要的一欄——沒有它，同名的另一個人也會被收進來。",
      },
      {
        key: "strictAnchors",
        label: "嚴格模式：沒出現定位詞就不收",
        type: "boolean",
        default: true,
        help: "關掉會把「只出現名字、沒出現定位詞」的頁面也收進來，並標記為 weak。",
      },
      {
        key: "aliases",
        label: "別名／舊名／外文名",
        type: "string",
        help: "逗號分隔，最多 5 個。每個別名只加一次查詢，不會整組角度乘上去。",
      },
      {
        key: "angles",
        label: "要查哪些角度",
        type: "multiselect",
        choices: ANGLE_CHOICES,
        help: "留空 = 用該類型的預設角度。每勾一個角度、每種語言各算一次查詢（計費）。",
      },
      {
        key: "languages",
        label: "查詢語言",
        type: "multiselect",
        default: "zh,en",
        choices: [
          { value: "zh", label: "中文" },
          { value: "en", label: "English" },
        ],
        help: "兩種都勾 = 查詢次數加倍，但中英文的來源本來就不同一批。",
      },
      {
        key: "maxResultsPerQuery",
        label: "每個角度取幾筆結果",
        type: "number",
        default: 8,
        help: "上限 20。每一筆都會再去真的抓一次頁面。",
      },
      {
        key: "domains",
        label: "只找這些網域",
        type: "string",
        help: "逗號分隔，最多 20 個。留空 = 全網。",
      },
      {
        key: "recency",
        label: "只要多新的內容",
        type: "select",
        default: "",
        choices: [
          { value: "", label: "不限（建檔用這個）" },
          { value: "year", label: "一年內" },
          { value: "month", label: "一個月內" },
          { value: "week", label: "一週內" },
          { value: "day", label: "一天內" },
        ],
      },
    ],
  },

  /** 3 — the same tier as the other query sources; `entity://` is this block's scheme alone. */
  match(t: Target): number {
    if (!providerConfigured(searchProviderId())) return 0;
    return t.uri.startsWith(`${ENTITY_SCHEME}://`) ? 3 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    const entity = entityRefFromMeta(t);
    if (!entity.name) throw Object.assign(new Error("entity_name_missing"), { status: 400 });
    if (!ctx.callProvider) throw Object.assign(new Error("provider_call_unavailable"), { status: 501 });

    const providerId = searchProviderId();
    const driver = SEARCH_DRIVERS[providerId];
    if (!driver) throw Object.assign(new Error(`unknown_search_provider_${providerId}`), { status: 501 });

    const meta = t.meta ?? {};
    const angleIds = anglesFromMeta(entity.kind, meta.angles);
    const plan = buildQueryPlan({
      name: entity.name,
      kind: entity.kind,
      anchors: entity.anchors,
      aliases: entity.aliases,
      angleIds,
      languages: parseLanguages(meta.languages ?? "zh,en"),
    });
    const maxResults = Math.min(Math.max(Number(meta.maxResultsPerQuery ?? 8) || 8, 1), 20);
    const domains = domainFilter(meta.domains);
    const recency = typeof meta.recency === "string" && meta.recency ? meta.recency : undefined;

    ctx.log(`dossier "${entity.name}" (${entity.kind}) — ${plan.length} queries via ${providerId}`);

    const discovered: Target[] = [];
    const seen = new Set<string>();
    let executed = 0;

    for (const planned of plan) {
      let results;
      try {
        const res = await ctx.callProvider(
          providerId,
          driver.request({ query: planned.query, maxResults, domains, recency, languages: [planned.lang] }),
        );
        results = driver.parse(await res.json());
      } catch (e) {
        // A budget stop mid-plan returns what the earlier queries already found instead of throwing
        // it all away. The orchestrator queues those roots, persists the frontier, and the resumed
        // run fetches them — whereas a throw here would requeue the entity target itself and the
        // queries that were already PAID FOR would be run again from scratch.
        if (e instanceof CollectFetchError && e.kind === "budget") {
          ctx.log(`dossier "${entity.name}": budget reached after ${executed}/${plan.length} queries`);
          break;
        }
        // One angle failing is not the dossier failing. A 4xx from one query (a vendor rejecting a
        // particular operator string, say) must not cost the other seven angles.
        ctx.log(`dossier "${entity.name}": angle ${planned.angle}/${planned.lang} failed: ${String(e).slice(0, 120)}`);
        continue;
      }
      executed++;

      for (const { url, r } of usableResults(results)) {
        // Across angles as well as within one: the same profile page is returned by "who is this"
        // and by "career", and paying to fetch it twice is avoidable here.
        const key = `${url.hostname}${url.pathname}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        discovered.push({
          uri: url.toString(),
          canonicalUri: ctx.canonicalize(url.toString()),
          tier: 0,
          // A ROOT, not a hop: the `entity://…` target is not a page, so its results are not one
          // link away from anything. See orchestrator.ts's enqueueDiscovered.
          depth: 0,
          scope: { hosts: [url.hostname] },
          meta: {
            // The assertion the relevance gate tests each fetched page against.
            entity,
            // Belt and braces with the scope above: even if a later change made scope wider, this
            // says "read this page, follow nothing". A dossier is a set of pages, not a crawl.
            maxDepth: 0,
            // The folder is named after the ENTITY, not the query, so all angles land together
            // instead of scattering one folder per phrasing (sink/kb.ts).
            searchQuery: entity.name,
            searchAngle: planned.angle,
            searchLang: planned.lang,
            searchProvider: providerId,
            searchSnippet: typeof r.snippet === "string" ? r.snippet.slice(0, 300) : undefined,
            searchDate: r.date ?? r.last_updated ?? undefined,
          },
        });
      }
    }

    ctx.log(`dossier "${entity.name}": ${executed} queries -> ${discovered.length} unique pages to read`);
    return { docs: [], discovered };
  },
};

/** What a plan will cost, for the UI to state before anything is spent. */
export function plannedQueryCount(plan: PlannedQuery[]): number {
  return plan.length;
}

registerCollector(entityDossierCollector);
