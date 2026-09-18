// collect/academic — papers from the open scholarly registries.
//
// ENTRY IS A QUERY, NOT A URL, and that is a different kind of source. ADR 013 settles what that
// means: the unit a human approves is the SOURCE, and here the source is "this registry plus this
// query". Configuring it in the catalogue IS the approval; the papers it returns then flow in
// without anyone approving them one by one, which is the only version of this that is useful.
//
// WHAT COMES BACK, stated plainly because it decides what the knowledge base can honestly answer:
// metadata and ABSTRACTS are open for essentially every paper. FULL TEXT is not — it is open only
// where the publisher made it open. This collector therefore stores the abstract plus a link, and
// fetches full text only from the open-access location the registry itself points at. It does not
// go looking for a copy elsewhere: "we found the PDF on some other site" is how a knowledge base
// acquires a licensing problem.
//
// Three registries, no API key between them:
//   * OpenAlex  — the broad one (covers Crossref, PubMed, arXiv and more), free, no key.
//   * arXiv     — preprints, first, with the abstract in the feed.
//   * Crossref  — the DOI registry itself: authoritative for citation metadata.
// All three ask for a contact email in the user agent and give you a faster, more reliable pool for
// it (the "polite pool"). COLLECT_CONTACT_EMAIL supplies it; without one they still answer, more
// slowly and with less patience.
//
// PICO (Population / Intervention / Comparison / Outcome, plus study type and a year range) is an
// OPTIONAL, additional way to build the query, sitting next to the free-text one above rather than
// replacing it: SciSpace's own published prompting guide structures a search exactly this way, and
// buildPicoQuery turns that structure into a REAL boolean query instead of prose a registry's
// relevance ranking has to guess at. An operator who fills in no PICO field is unaffected — the free
// text keeps working exactly as it does today.

import { createHash } from "node:crypto";
import type { CollectBlock, CollectCtx, RawDoc, SourceOption, Target } from "@/lib/collect/types";
import { registerCollector } from "@/lib/collect/registry";
import { COLLECTED_PROVENANCE } from "@/lib/collect/provenance";

export type Registry = "openalex" | "arxiv" | "crossref";

export interface Paper {
  id: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: string[];
  publishedAt: string | null;
  venue: string | null;
  landingUrl: string;
  /** Set only when the registry itself says a free full text lives here. */
  openAccessUrl: string | null;
  citedByCount?: number;
  registry: Registry;
}

const REGISTRY_OPTION: SourceOption = {
  key: "registry",
  label: "檢索來源",
  type: "select",
  default: "openalex",
  choices: [
    { value: "openalex", label: "OpenAlex（最廣，涵蓋 Crossref／PubMed／arXiv）" },
    { value: "arxiv", label: "arXiv（預印本，最新）" },
    { value: "crossref", label: "Crossref（DOI 註冊處，引用資料最權威）" },
  ],
  help:
    "三個都免金鑰。不確定就用 OpenAlex。PICO 欄位的 AND／OR 對 OpenAlex 與 arXiv 是真布林查詢；" +
    "Crossref 不支援布林語法，PICO 欄位會被當一般關鍵字比對，精準度較低。",
};

/**
 * PICO, as options rather than prose. Every field is OPTIONAL (validateSourceConfig only enforces
 * `required: true` fields) — an operator who sets none of these gets exactly today's free-text
 * behaviour; see buildPicoQuery for what filling them in actually does to the query.
 *
 * Each string field takes a comma-separated list of synonyms ("older adults, elderly") rather than
 * pre-written boolean syntax, on purpose: an operator picking a research question apart into PICO
 * should not also have to know this collector's query language.
 */
const PICO_OPTIONS: SourceOption[] = [
  { key: "picoPopulation", label: "族群／對象（PICO：P）", type: "string", help: "同義詞用逗號分隔，會轉成 OR。留空則不限定。" },
  { key: "picoIntervention", label: "介入或暴露（PICO：I）", type: "string", help: "同義詞用逗號分隔。" },
  { key: "picoComparison", label: "比較對照（PICO：C）", type: "string", help: "沒有對照組（例如單組研究）就留空——填了會要求論文也提到這個對照。" },
  { key: "picoOutcome", label: "結果指標（PICO：O）", type: "string", help: "同義詞用逗號分隔。" },
  { key: "picoStudyType", label: "研究類型", type: "string", help: "例如「randomized controlled trial, systematic review」，逗號分隔多個（OR）。" },
  { key: "picoYearFrom", label: "發表年份下限", type: "number", help: "留空不限。" },
  { key: "picoYearTo", label: "發表年份上限", type: "number", help: "留空不限。" },
];

/** OpenAlex stores abstracts as an inverted index, for reasons of its own. */
export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

/** arXiv and several publishers wrap abstracts in tags; Crossref uses JATS. */
export function stripJats(s: string): string {
  return s
    .replace(/<jats:[^>]*>/g, " ")
    .replace(/<\/jats:[^>]*>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Registry drivers ─────────────────────────────────────────────────────────
// Each one maps ITS response to the same Paper. Adding a registry is one function plus one choice
// in the option above; nothing downstream learns a new shape.

interface OpenAlexWork {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_date?: string;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { landing_page_url?: string; pdf_url?: string; source?: { display_name?: string } };
  best_oa_location?: { pdf_url?: string; landing_page_url?: string };
}

function fromOpenAlex(w: OpenAlexWork): Paper | null {
  const title = w.display_name ?? w.title;
  if (!title) return null;
  const landing = w.primary_location?.landing_page_url ?? (w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/doi\.org\//, "")}` : w.id);
  if (!landing) return null;
  return {
    id: w.id ?? landing,
    doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : null,
    title,
    abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
    publishedAt: isoDate(w.publication_date),
    venue: w.primary_location?.source?.display_name ?? null,
    landingUrl: landing,
    openAccessUrl: w.best_oa_location?.pdf_url ?? w.best_oa_location?.landing_page_url ?? null,
    citedByCount: w.cited_by_count,
    registry: "openalex",
  };
}

export function parseArxivFeed(xml: string): Paper[] {
  const out: Paper[] = [];
  for (const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = entry[1];
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(body);
      return m ? stripJats(m[1]) : null;
    };
    const id = pick("id");
    const title = pick("title");
    if (!id || !title) continue;
    const authors = [...body.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map((m) =>
      stripJats(m[1]),
    );
    // Attribute order is not fixed in the feed, and requiring title before href silently returned
    // no PDF for every arXiv paper — a live run showed 5 papers and 0 open-access targets, which is
    // wrong for a repository where every paper is open.
    const pdf =
      [...body.matchAll(/<link\b[^>]*>/g)]
        .filter((m) => /title="pdf"/.test(m[0]) || /type="application\/pdf"/.test(m[0]))
        .map((m) => /href="([^"]+)"/.exec(m[0])?.[1])
        .find(Boolean) ?? null;
    const doi = pick("arxiv:doi");
    out.push({
      id,
      doi,
      title,
      abstract: pick("summary"),
      authors,
      publishedAt: isoDate(pick("published")),
      venue: "arXiv",
      landingUrl: id,
      openAccessUrl: pdf, // arXiv is open access by definition — the PDF link is the paper
      registry: "arxiv",
    });
  }
  return out;
}

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  link?: Array<{ URL?: string; "content-type"?: string; "intended-application"?: string }>;
  "is-referenced-by-count"?: number;
}

function fromCrossref(item: CrossrefItem): Paper | null {
  const title = item.title?.[0];
  const landing = item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : null);
  if (!title || !landing) return null;
  const parts = item.issued?.["date-parts"]?.[0];
  const published = parts?.length ? isoDate(`${parts[0]}-${String(parts[1] ?? 1).padStart(2, "0")}-${String(parts[2] ?? 1).padStart(2, "0")}`) : null;
  return {
    id: item.DOI ?? landing,
    doi: item.DOI ?? null,
    title,
    abstract: item.abstract ? stripJats(item.abstract) : null,
    authors: (item.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    publishedAt: published,
    venue: item["container-title"]?.[0] ?? null,
    landingUrl: landing,
    // Crossref lists full-text links, but only some are free — "similarity-checking" links are not
    // for us. Anything unclear is treated as not open, which is the safe direction for licensing.
    openAccessUrl:
      item.link?.find((l) => l["intended-application"] === "text-mining" && l["content-type"] === "application/pdf")?.URL ?? null,
    citedByCount: item["is-referenced-by-count"],
    registry: "crossref",
  };
}

// ── The block ────────────────────────────────────────────────────────────────

function contactEmail(env: Record<string, string | undefined> = process.env): string | null {
  return env.COLLECT_CONTACT_EMAIL || null;
}

function queryOf(t: Target): string {
  // The entry is a query string carried as `kb-query://<urlencoded>` so it still passes through a
  // URL-shaped Target without pretending to be a web address.
  if (t.uri.startsWith("academic://")) return decodeURIComponent(t.uri.slice("academic://".length));
  return t.hint ?? "";
}

export interface PicoFields {
  population?: string;
  intervention?: string;
  comparison?: string;
  outcome?: string;
  studyType?: string;
}

/**
 * One field's value, read as a comma-separated list of synonyms and OR'd together —
 * "diabetes, type 2 diabetes" becomes `("diabetes" OR "type 2 diabetes")`. A single term needs no
 * parentheses. Multi-word terms are quoted so the shared boolean syntax (OpenAlex and arXiv both
 * document double-quote phrase search) reads them as one phrase rather than N separately-ANDed words.
 */
function orTerms(value: string | undefined): string | null {
  const terms = (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.includes(" ") ? `"${t}"` : t));
  if (!terms.length) return null;
  return terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
}

/**
 * PICO turned into one boolean query: non-empty fields are ANDed, each field's own synonyms are
 * OR'd (orTerms). Pure and registry-agnostic on purpose — what OpenAlex/arXiv/Crossref each do with
 * the resulting string is buildSearchUrl's concern, not this one's.
 *
 * Empty input (no PICO field set) returns "" — the caller falls back to the free-text query, so an
 * operator who never touches these fields sees no change at all.
 */
export function buildPicoQuery(fields: PicoFields): string {
  return [orTerms(fields.population), orTerms(fields.intervention), orTerms(fields.comparison), orTerms(fields.outcome), orTerms(fields.studyType)]
    .filter((c): c is string => c !== null)
    .join(" AND ");
}

/** Pulls PICO fields off a Target's meta, tolerating anything that is not a non-empty string. */
function picoFieldsOf(meta: Record<string, unknown> | undefined): PicoFields {
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
  return {
    population: str(meta?.picoPopulation),
    intervention: str(meta?.picoIntervention),
    comparison: str(meta?.picoComparison),
    outcome: str(meta?.picoOutcome),
    studyType: str(meta?.picoStudyType),
  };
}

export interface YearRange {
  from?: number;
  to?: number;
}

/** picoYearFrom/picoYearTo off a Target's meta. Returns undefined when neither is a usable year. */
function yearRangeOf(meta: Record<string, unknown> | undefined): YearRange | undefined {
  const year = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const from = year(meta?.picoYearFrom);
  const to = year(meta?.picoYearTo);
  return from || to ? { from, to } : undefined;
}

export type SortBy = "relevance" | "date";

/**
 * arXiv's own documented range syntax is a field, not a filter: `submittedDate:[FROM TO TO]` joins
 * the rest of the query with a plain AND (see e.g. the manual's `au:X AND submittedDate:[...]`
 * example) — there is no separate date-filter parameter the way OpenAlex/Crossref have one.
 * Open-ended bounds use sentinels rather than a wildcard: arXiv's docs show only fully-bounded
 * ranges, and guessing wildcard support here is exactly the kind of API behaviour AGENTS.md says to
 * verify, not assume. 1991-01-01 predates arXiv itself; 2099-12-31 will outlive this file.
 */
function arxivDateClause(range: YearRange | undefined): string {
  if (!range || (!range.from && !range.to)) return "";
  const from = range.from ? `${range.from}0101` : "19910101";
  const to = range.to ? `${range.to}1231` : "20991231";
  return ` AND submittedDate:[${from}0000 TO ${to}2359]`;
}

/** OpenAlex's and Crossref's date filters, both `&filter=key:YYYY-MM-DD,key2:YYYY-MM-DD` in shape. */
function dateFilterParam(fromKey: string, toKey: string, range: YearRange | undefined): string {
  if (!range || (!range.from && !range.to)) return "";
  const parts = [range.from ? `${fromKey}:${range.from}-01-01` : null, range.to ? `${toKey}:${range.to}-12-31` : null].filter(Boolean);
  return `&filter=${parts.join(",")}`;
}

/**
 * Sorting by date on a broad query returns junk, and this was measured rather than assumed: a live
 * OpenAlex call for "retrieval augmented generation" sorted by date put "Journal of GIS based
 * Historical Studies" first, with a publication date in 2029. Newest-that-matches-at-all is not the
 * same question as best-match, and for filling a knowledge base it is the wrong one.
 *
 * Date order stays available, because it is exactly right for the other use: watching a field for
 * what came out this week.
 */
export function buildSearchUrl(
  registry: Registry,
  query: string,
  limit: number,
  email: string | null,
  sortBy: SortBy = "relevance",
  yearRange?: YearRange,
): string {
  const mailto = email ? `&mailto=${encodeURIComponent(email)}` : "";
  switch (registry) {
    case "arxiv": {
      const sort = sortBy === "date" ? "submittedDate" : "relevance";
      const q = encodeURIComponent(`${query}${arxivDateClause(yearRange)}`);
      return `https://export.arxiv.org/api/query?search_query=all:${q}&start=0&max_results=${limit}&sortBy=${sort}&sortOrder=descending`;
    }
    case "crossref": {
      const sort = sortBy === "date" ? "&sort=published&order=desc" : "&sort=relevance";
      const q = encodeURIComponent(query);
      return `https://api.crossref.org/works?query=${q}&rows=${limit}${sort}${mailto}${dateFilterParam("from-pub-date", "until-pub-date", yearRange)}`;
    }
    case "openalex":
    default: {
      const sort = sortBy === "date" ? "publication_date:desc" : "relevance_score:desc";
      const q = encodeURIComponent(query);
      return `https://api.openalex.org/works?search=${q}&per-page=${limit}&sort=${sort}${mailto}${dateFilterParam("from_publication_date", "to_publication_date", yearRange)}`;
    }
  }
}

export function paperToDoc(paper: Paper, ctx: CollectCtx, query: string): RawDoc {
  // Title, authors, venue and abstract in one text body: the abstract alone loses the very fields a
  // citation needs, and the knowledge base has nowhere else to put them yet.
  const header = [
    paper.title,
    paper.authors.length ? paper.authors.join(", ") : null,
    [paper.venue, paper.publishedAt?.slice(0, 10)].filter(Boolean).join(", ") || null,
    paper.doi ? `DOI: ${paper.doi}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const text = [header, paper.abstract ?? ""].filter(Boolean).join("\n\n").trim();

  return {
    uri: paper.landingUrl,
    canonicalUrl: ctx.canonicalize(paper.doi ? `https://doi.org/${paper.doi}` : paper.landingUrl),
    contentHash: createHash("sha256").update(text, "utf8").digest("hex"),
    mime: "text/plain",
    title: paper.title,
    author: paper.authors.join(", ") || null,
    contentType: "academic_paper",
    text,
    // No raw payload: this came from an API as structured data, so the density check does not apply
    // (quality.ts states that branch). Length and screening still do.
    raw: null,
    fetchedAt: new Date().toISOString(),
    publishedAt: paper.publishedAt,
    collector: `collect/academic:${paper.registry}`,
    tenantRef: ctx.tenantRef,
    provenance: { ...COLLECTED_PROVENANCE },
    meta: {
      doi: paper.doi,
      venue: paper.venue,
      authors: paper.authors,
      citedByCount: paper.citedByCount,
      registry: paper.registry,
      openAccessUrl: paper.openAccessUrl,
      // An abstract is not the paper. Recorded so a consumer can say so rather than implying it
      // read the whole thing.
      isAbstractOnly: true,
      // Same key collect/web-search.ts stamps on its own discovered targets — sink/kb.ts reads this
      // one name to auto-file a search run's results into a folder (operator, 2026-09-18), so both
      // query-entry collectors feed it the same way rather than the sink knowing two field names.
      searchQuery: query,
    },
  };
}

export const academicCollector: CollectBlock = {
  id: "collect/academic",
  title: "學術論文（OpenAlex / arXiv / Crossref）",
  icon: "🎓",

  describe: {
    kind: "academic",
    summary: "用一句查詢追一個研究主題，或用 PICO 欄位精準組查詢，取回論文的題名、作者、期刊、DOI 與摘要。三個來源都免金鑰。",
    entry: "query",
    queryScheme: "academic",
    options: [
      REGISTRY_OPTION,
      { key: "limit", label: "每次取回篇數", type: "number", default: 25, help: "上限 100。" },
      {
        key: "sortBy",
        label: "排序",
        type: "select",
        default: "relevance",
        choices: [
          { value: "relevance", label: "相關度（建庫用這個）" },
          { value: "date", label: "最新發表（追蹤領域動態用）" },
        ],
      },
      {
        key: "requireAbstract",
        label: "沒有摘要就不收",
        type: "boolean",
        default: true,
        help: "關掉會讓「只有題名與 DOI」的紀錄也進庫——那種紀錄回答不了任何問題。",
      },
      {
        key: "openAccessOnly",
        label: "只收開放取用的論文",
        type: "boolean",
        default: false,
        help: "打開後，沒有免費全文的論文不會進知識庫（仍可看到它存在）。",
      },
      ...PICO_OPTIONS,
    ],
  },

  match(t: Target): number {
    return t.uri.startsWith("academic://") ? 3 : 0;
  },

  async run(t: Target, ctx: CollectCtx): Promise<{ docs: RawDoc[]; discovered: Target[] }> {
    // PICO takes over the query the moment any field is filled in — see the file header for why
    // this is a replacement rather than a combination. Falls through to the free-text query exactly
    // as before when no PICO field is set (buildPicoQuery returns "" for an all-empty input).
    const query = buildPicoQuery(picoFieldsOf(t.meta)) || queryOf(t);
    if (!query) throw Object.assign(new Error("academic_query_missing"), { status: 400 });

    const registry = (t.meta?.registry as Registry) ?? "openalex";
    const limit = Math.min(Number(t.meta?.limit ?? 25) || 25, 100);
    const openAccessOnly = t.meta?.openAccessOnly === true;
    const requireAbstract = t.meta?.requireAbstract !== false;

    const sortBy: SortBy = t.meta?.sortBy === "date" ? "date" : "relevance";
    const res = await ctx.fetch(buildSearchUrl(registry, query, limit, contactEmail(), sortBy, yearRangeOf(t.meta)));
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${registry}`), { status: res.status });

    let papers: Paper[];
    if (registry === "arxiv") {
      papers = parseArxivFeed(await res.text());
    } else if (registry === "crossref") {
      const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };
      papers = (json.message?.items ?? []).map(fromCrossref).filter((p): p is Paper => p !== null);
    } else {
      const json = (await res.json()) as { results?: OpenAlexWork[] };
      papers = (json.results ?? []).map(fromOpenAlex).filter((p): p is Paper => p !== null);
    }

    // A record with no abstract is a citation, not a document: it answers no question, and storing
    // it would put a title and a DOI into the knowledge base as if they were content. Crossref in
    // particular returns many of these (publishers are not obliged to deposit abstracts).
    const withAbstract = requireAbstract ? papers.filter((p) => p.abstract) : papers;
    const kept = openAccessOnly ? withAbstract.filter((p) => p.openAccessUrl) : withAbstract;
    ctx.log(
      `academic ${registry} "${query}": ${papers.length} found, ${papers.length - withAbstract.length} without abstract, ${kept.length} kept`,
    );

    return {
      // Abstract-level documents, which is what these registries can give for everything.
      docs: kept.map((p) => paperToDoc(p, ctx, query)),
      // The open-access full text is offered as a normal target, so the ordinary tiers fetch it and
      // the ordinary quality gate judges it. Nothing here goes hunting for a copy on another site.
      discovered: kept
        .filter((p) => p.openAccessUrl)
        .map((p) => ({
          uri: p.openAccessUrl!,
          canonicalUri: ctx.canonicalize(p.openAccessUrl!),
          // Its own host, because a paper's PDF lives wherever the publisher put it — inheriting the
          // registry's scope would drop every one of them.
          scope: { hosts: [new URL(p.openAccessUrl!).hostname] },
          tier: 0,
          depth: t.depth + 1,
          meta: { doi: p.doi, fromRegistry: p.registry },
        })),
    };
  },
};

registerCollector(academicCollector);
