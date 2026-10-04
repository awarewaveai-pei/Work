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

import type { AsideEntry, ChannelState, CollectBlock, CollectCtx, RawDoc, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { ProviderCallError, providerConfigured } from "@/lib/collect/net/providers";
import { CollectFetchError } from "@/lib/collect/net/fetcher";
import {
  CLAIM_PROVIDERS,
  SEARCH_DRIVERS,
  SEARCH_KEYS,
  domainFilter,
  searchProviderId,
  usableResults,
} from "@/lib/collect/search/drivers";
import {
  ANGLES,
  CLAIM_ANGLES,
  DEFAULT_ANGLES,
  MAX_QUERIES,
  buildQueryPlan,
  defaultLanguagesFor,
  fanOut,
  parseLanguages,
  type PlannedQuery,
  type QueryLang,
  type SearchCall,
} from "@/lib/collect/search/query-plan";
import { DOSSIER_EXCLUDED_BY_DEFAULT, classifySource, sourceClassLabel } from "@/lib/collect/source-class";
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

/**
 * Angle ids the operator ticked, falling back to the defaults for this entity kind.
 *
 * Choices are stored as `<kind>:<angleId>` because `identity` and `news` exist under BOTH person and
 * company: a flat list gave two checkboxes the same value, so ticking one visibly ticked the other
 * and React saw duplicate keys. Bare ids are still accepted — rows written before this change have
 * them, and silently dropping those would turn a configured source into a default one with nothing
 * saying so.
 */
export function anglesFromMeta(kind: EntityKind, value: unknown): string[] {
  const chosen = parseTermList(value, MAX_QUERIES)
    .map((v) => (v.includes(":") ? v.split(":") : [kind, v]))
    .filter(([k, id]) => k === kind && ANGLES[kind].some((a) => a.id === id))
    .map(([, id]) => id);
  return chosen.length ? chosen : DEFAULT_ANGLES[kind];
}

/**
 * A claim to check (Cognitive OS wire v2, STEP2_SHARED_RULES §4.1): `entity://claim/<id>` with meta.kind "claim".
 * A claim is a sentence, not a name: no `entity` is stamped on its results, so the relevance gate's name matching
 * never runs on them (the quality gate still does).
 */
export function isClaimTarget(t: Target): boolean {
  return t.meta?.kind === "claim";
}

/** The wire sends JSON arrays; anything not on `allowed` is dropped, repeats once. */
function listOf<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v)))];
}

/** What one search target asks for: its queries, the engines it names, which of them have a key, the stamp. */
interface SearchPlan {
  label: string;
  plan: PlannedQuery[];
  providers: string[];
  keyed: string[];
  stamp: (call: SearchCall) => Record<string, unknown>;
}

function entitySearch(t: Target): SearchPlan {
  const entity = entityRefFromMeta(t);
  if (!entity.name) throw Object.assign(new Error("entity_name_missing"), { status: 400 });
  const providerId = searchProviderId();
  if (!SEARCH_DRIVERS[providerId]) throw Object.assign(new Error(`unknown_search_provider_${providerId}`), { status: 501 });
  const meta = t.meta ?? {};
  return {
    label: `dossier "${entity.name}" (${entity.kind})`,
    plan: buildQueryPlan({
      name: entity.name,
      kind: entity.kind,
      anchors: entity.anchors,
      aliases: entity.aliases,
      angleIds: anglesFromMeta(entity.kind, meta.angles),
      // Empty means "decide from the name", not "search everything": see defaultLanguagesFor.
      languages: parseLanguages(meta.languages).length
        ? parseLanguages(meta.languages)
        : defaultLanguagesFor(entity.name),
    }),
    providers: [providerId],
    keyed: [providerId], // match() already scored 0 for an engine without a key
    stamp: () => ({
      // The assertion the relevance gate tests each fetched page against.
      entity,
      // The folder is named after the ENTITY, not the query, so all angles land together
      // instead of scattering one folder per phrasing (sink/kb.ts).
      searchQuery: entity.name,
    }),
  };
}

function claimSearch(t: Target): SearchPlan {
  const meta = t.meta ?? {};
  // The claim lives in meta only: the uri carries an id, and searching for "claim/<id>" would bill for nothing.
  const name = typeof meta.entityName === "string" ? meta.entityName.trim() : "";
  if (!name) throw Object.assign(new Error("entity_name_missing"), { status: 400 });
  const allAngles = CLAIM_ANGLES.map((a) => a.id);
  const angleIds = listOf(meta.angles, allAngles);
  const languages = listOf<QueryLang>(meta.languages, ["zh", "en"]);
  const listed = listOf(meta.providers, CLAIM_PROVIDERS);
  const providers = listed.length ? listed : [...CLAIM_PROVIDERS];
  return {
    label: `claim "${name.slice(0, 60)}"`,
    plan: buildQueryPlan({
      name,
      kind: "claim",
      anchors: [],
      aliases: [],
      angleIds: angleIds.length ? angleIds : allAngles,
      languages: languages.length ? languages : ["zh", "en"],
    }),
    providers,
    // A listed engine without a key is reported as a `no_key` channel, never run and never an error.
    keyed: providers.filter((p) => providerConfigured(p)),
    // 「用哪句查詢找到的」: the query itself.
    stamp: (call) => ({ searchQuery: call.query }),
  };
}

/** A stop for the whole run, from the crawler's door or the provider door — not this query failing. */
function isBudgetStop(e: unknown): boolean {
  return (e instanceof CollectFetchError || e instanceof ProviderCallError) && e.kind === "budget";
}

/** ChannelState.why for a query that failed. */
function failureCode(e: unknown): string {
  const status = e && typeof e === "object" && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  if (Number.isFinite(status)) return `http_${status}`;
  return e instanceof ProviderCallError && e.kind === "network" ? "network" : "error";
}

const KIND_CHOICES: Array<{ value: EntityKind; label: string; short: string }> = [
  { value: "person", label: "人（個人背景）", short: "人" },
  { value: "company", label: "公司／組織", short: "公司" },
  { value: "event", label: "事件", short: "事件" },
];

/**
 * Angle choices for the UI. Every kind's angles are listed together, prefixed, because the option
 * schema is static while the chosen kind is not — and a box that silently changes its contents
 * after the operator ticked things is worse than a longer list.
 */
const ANGLE_CHOICES = (Object.keys(ANGLES) as EntityKind[]).flatMap((kind) => {
  const k = KIND_CHOICES.find((c) => c.value === kind)!;
  // `short`, not label.slice(0, 2): slicing "人（個人背景）" produced the label "人（·身分／職稱",
  // which shipped to the operator exactly like that (2026-09-20).
  return ANGLES[kind].map((a) => ({ value: `${kind}:${a.id}`, label: `${k.short}·${a.label}` }));
});

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
        key: "includeShops",
        label: "連購物／社群／列表頁也收",
        type: "boolean",
        default: false,
        help: "預設不收。Amazon、書店、Facebook、標籤頁這類頁面會出現你的對象的名字，但沒有任何可引用的事實——2026-09-20 實測它們佔掉一半的結果。",
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
    if (!t.uri.startsWith(`${ENTITY_SCHEME}://`)) return 0;
    // A claim runs even with no engine keyed: it reports each listed engine without a key as a channel.
    if (isClaimTarget(t)) return 3;
    return providerConfigured(searchProviderId()) ? 3 : 0;
  },

  /** The channels a target would have used, for a run that stopped before reaching it; a target with no plan has none. */
  notRun(t: Target, why: string): { channels: ChannelState[] } {
    let search: SearchPlan;
    try {
      search = isClaimTarget(t) ? claimSearch(t) : entitySearch(t);
    } catch {
      return { channels: [] };
    }
    const langs = [...new Set(search.plan.map((q) => q.lang))];
    return {
      channels: search.providers.flatMap((provider) =>
        langs.map((lang): ChannelState =>
          search.keyed.includes(provider) ? { provider, lang, state: "unreachable", why } : { provider, lang, state: "no_key", why: "no_key" },
        ),
      ),
    };
  },

  async run(
    t: Target,
    ctx: CollectCtx,
  ): Promise<{ docs: RawDoc[]; discovered: Target[]; aside: AsideEntry[]; channels: ChannelState[] }> {
    const search = isClaimTarget(t) ? claimSearch(t) : entitySearch(t);
    if (!ctx.callProvider) throw Object.assign(new Error("provider_call_unavailable"), { status: 501 });

    const meta = t.meta ?? {};
    const maxResults = Math.min(Math.max(Number(meta.maxResultsPerQuery ?? 8) || 8, 1), 20);
    const domains = domainFilter(meta.domains);
    const recency = typeof meta.recency === "string" && meta.recency ? meta.recency : undefined;
    const { calls, cut } = fanOut(search.plan, search.keyed);
    const langs = [...new Set(search.plan.map((q) => q.lang))];
    // Per keyed (engine, language): answered at least once = ok; else why it never did ("budget" = not reached).
    const tally = new Map<string, { answered: number; why: string }>(
      search.keyed.flatMap((p) => langs.map((lang): [string, { answered: number; why: string }] => [`${p}/${lang}`, { answered: 0, why: "budget" }])),
    );

    ctx.log(`${search.label} — ${calls.length} queries via ${search.keyed.join("+") || "no engine with a key"}`);

    const discovered: Target[] = [];
    const aside: AsideEntry[] = [];
    const seen = new Set<string>();
    const skippedByClass: string[] = [];
    const excluded = meta.includeShops === true ? [] : DOSSIER_EXCLUDED_BY_DEFAULT;
    let executed = 0;

    for (const call of calls) {
      const channel = tally.get(`${call.provider}/${call.lang}`)!;
      const driver = SEARCH_DRIVERS[call.provider];
      let results;
      try {
        const res = await ctx.callProvider(
          call.provider,
          driver.request({ query: call.query, maxResults, domains, recency, languages: [call.lang] }),
        );
        results = driver.parse(await res.json());
      } catch (e) {
        // A budget stop mid-plan returns what the earlier queries already found instead of throwing
        // it all away. The orchestrator queues those roots, persists the frontier, and the resumed
        // run fetches them — whereas a throw here would requeue the entity target itself and the
        // queries that were already PAID FOR would be run again from scratch.
        if (isBudgetStop(e)) {
          ctx.log(`${search.label}: budget reached after ${executed}/${calls.length} queries`);
          break;
        }
        // One angle failing is not the dossier failing. A 4xx from one query (a vendor rejecting a
        // particular operator string, say) must not cost the other seven angles.
        if (!channel.answered) channel.why = failureCode(e);
        ctx.log(`${search.label}: ${call.provider} ${call.angle}/${call.lang} failed: ${String(e).slice(0, 120)}`);
        continue;
      }
      channel.answered++;
      executed++;

      for (const { url, r } of usableResults(results)) {
        // Across angles and engines as well as within one: the same profile page is returned by
        // "who is this" and by "career", and paying to fetch it twice is avoidable here. The first
        // query that found it is the one stamped.
        const key = `${url.hostname}${url.pathname}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        // Refused BEFORE it is fetched: a bookshop listing costs a fetch, a quality grade, an
        // injection screen and a row in the knowledge base to learn what its URL already said.
        // Fails open — an unclassified host is admitted (lib/collect/source-class.ts). Reported as
        // aside, not dropped: the person can take it back.
        const cls = classifySource(url.toString());
        const title = typeof r.title === "string" ? r.title.slice(0, 300) : "";
        if (excluded.includes(cls)) {
          skippedByClass.push(`${sourceClassLabel(cls)} ${url.hostname}`);
          aside.push({ url: url.toString(), title, reason: `source_class:${cls}` });
          continue;
        }
        discovered.push({
          uri: url.toString(),
          canonicalUri: ctx.canonicalize(url.toString()),
          tier: 0,
          // A ROOT, not a hop: the `entity://…` target is not a page, so its results are not one
          // link away from anything. See orchestrator.ts's enqueueDiscovered.
          depth: 0,
          scope: { hosts: [url.hostname] },
          meta: {
            ...search.stamp(call),
            sourceClass: cls,
            // Belt and braces with the scope above: even if a later change made scope wider, this
            // says "read this page, follow nothing". A dossier is a set of pages, not a crawl.
            maxDepth: 0,
            searchAngle: call.angle,
            searchLang: call.lang,
            searchProvider: call.provider,
            // The title an aside entry shows when the page itself cannot be read.
            searchTitle: title || undefined,
            searchSnippet: typeof r.snippet === "string" ? r.snippet.slice(0, 300) : undefined,
            searchDate: r.date ?? r.last_updated ?? undefined,
          },
        });
      }
    }

    const channels: ChannelState[] = search.providers.flatMap((provider) =>
      langs.map((lang): ChannelState => {
        const c = tally.get(`${provider}/${lang}`);
        if (!c) return { provider, lang, state: "no_key", why: "no_key" };
        if (!c.answered) return { provider, lang, state: "unreachable", why: c.why };
        // The ceiling's cut is said, never silent: the angles this engine and language did not search.
        const notSearched = [...new Set(cut.filter((x) => x.provider === provider && x.lang === lang).map((x) => x.angle))];
        return { provider, lang, state: "ok", why: notSearched.length ? `cut:${notSearched.join(",")}` : "" };
      }),
    );

    ctx.log(
      `${search.label}: ${executed} queries -> ${discovered.length} unique pages to read` +
        (skippedByClass.length ? ` (skipped ${skippedByClass.length}: ${[...new Set(skippedByClass)].slice(0, 6).join(", ")})` : ""),
    );
    return { docs: [], discovered, aside, channels };
  },
};

/** What a plan will cost, for the UI to state before anything is spent. */
export function plannedQueryCount(plan: PlannedQuery[]): number {
  return plan.length;
}

registerCollector(entityDossierCollector);
