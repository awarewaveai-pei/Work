// Turning one entity into the several searches a background check actually needs.
//
// WHY THIS EXISTS: one query returns ten results, and a background check is not a ten-result
// question. An operator doing this by hand runs eight or nine searches — who is this, where do they
// work, what have they written, what has been written about them, what went wrong. Handing the
// machine one query and calling it "background research" just moves the other eight searches back
// onto the person.
//
// DATA, NOT CODE. An angle is one row in the table below. Adding "court records" to the company
// plan, or a third language, is an entry here and nothing else — no branch, no new block, no
// orchestrator change. That is the property that has to survive thirty years of somebody wanting
// one more angle.
//
// TEMPLATES ARE SEARCH STRINGS, NOT QUESTIONS. `"{name}" {anchor} 訴訟` is what a search engine can
// answer. "What legal trouble has this company been in?" is not — it produces an essay-shaped
// result set full of listicles. The quotes around {name} are load-bearing: without them a search
// for a two-word name returns pages containing either word.

import type { EntityKind } from "@/lib/collect/entity";

/** The language a query is phrased in. Sources differ by language, not just wording. */
export type QueryLang = "zh" | "en";

export interface Angle {
  /** Stable id — stored in source options and in each document's meta. Never rename one. */
  id: string;
  /** What the operator ticks. */
  label: string;
  /** Per language. A missing language for an angle simply produces no query for it. */
  templates: Partial<Record<QueryLang, string>>;
}

/**
 * `{name}` is the entity, `{anchor}` the first disambiguation term (empty when none was given —
 * every template therefore has to read correctly without it, which is why none of them puts
 * punctuation around it).
 */
export const ANGLES: Record<EntityKind, Angle[]> = {
  person: [
    { id: "identity", label: "身分／職稱", templates: { zh: '"{name}" {anchor} 是誰 簡介', en: '"{name}" {anchor} biography profile' } },
    { id: "affiliation", label: "任職機構", templates: { zh: '"{name}" {anchor} 任職 經歷', en: '"{name}" {anchor} appointed role career' } },
    { id: "works", label: "著作／作品", templates: { zh: '"{name}" 著作 出版 論文', en: '"{name}" author publications books' } },
    { id: "news", label: "新聞報導", templates: { zh: '"{name}" {anchor} 新聞 報導', en: '"{name}" {anchor} news' } },
    { id: "interview", label: "訪談／演講", templates: { zh: '"{name}" 專訪 演講 對談', en: '"{name}" interview talk lecture' } },
    { id: "controversy", label: "爭議／批評", templates: { zh: '"{name}" 爭議 批評 質疑', en: '"{name}" controversy criticism allegations' } },
    { id: "network", label: "關係人脈", templates: { zh: '"{name}" 共同 合作 董事 顧問', en: '"{name}" co-author board advisor affiliation' } },
  ],
  company: [
    { id: "identity", label: "公司簡介", templates: { zh: '"{name}" {anchor} 公司 簡介 官網', en: '"{name}" {anchor} company about official' } },
    { id: "registration", label: "登記／工商資料", templates: { zh: '"{name}" 統一編號 公司登記 商工登記', en: '"{name}" company registration filing incorporation' } },
    { id: "leadership", label: "經營團隊", templates: { zh: '"{name}" 創辦人 執行長 董事', en: '"{name}" founder CEO board of directors' } },
    { id: "funding", label: "募資／財務", templates: { zh: '"{name}" 募資 投資 營收 財報', en: '"{name}" funding round revenue investors' } },
    { id: "news", label: "新聞報導", templates: { zh: '"{name}" 新聞 報導', en: '"{name}" news coverage' } },
    { id: "legal", label: "訴訟／裁罰", templates: { zh: '"{name}" 訴訟 裁罰 違規 判決', en: '"{name}" lawsuit fine investigation ruling' } },
    { id: "products", label: "產品／服務", templates: { zh: '"{name}" 產品 服務 方案', en: '"{name}" products services pricing' } },
    { id: "reviews", label: "評價／客訴", templates: { zh: '"{name}" 評價 心得 客訴', en: '"{name}" reviews complaints glassdoor' } },
  ],
  event: [
    { id: "overview", label: "事件概述", templates: { zh: '"{name}" {anchor} 事件 經過', en: '"{name}" {anchor} what happened' } },
    { id: "timeline", label: "時間線", templates: { zh: '"{name}" 時間線 始末', en: '"{name}" timeline chronology' } },
    { id: "cause", label: "起因", templates: { zh: '"{name}" 原因 起因 調查', en: '"{name}" cause origin investigation' } },
    { id: "impact", label: "影響／傷亡", templates: { zh: '"{name}" 影響 傷亡 損失', en: '"{name}" impact casualties damage' } },
    { id: "accountability", label: "究責／處置", templates: { zh: '"{name}" 究責 處分 判決', en: '"{name}" accountability charges verdict' } },
    { id: "reactions", label: "各方反應", templates: { zh: '"{name}" 反應 聲明 回應', en: '"{name}" reaction statement response' } },
    { id: "aftermath", label: "後續發展", templates: { zh: '"{name}" 後續 進展 改革', en: '"{name}" aftermath developments reform' } },
  ],
};

/** Angles ticked by default: the ones a background check is incomplete without. */
export const DEFAULT_ANGLES: Record<EntityKind, string[]> = {
  person: ["identity", "affiliation", "works", "news", "controversy"],
  company: ["identity", "registration", "leadership", "news", "legal"],
  event: ["overview", "timeline", "cause", "impact", "accountability"],
};

/**
 * Hard ceiling on searches per run.
 *
 * Every query is a billed call. Seven angles × two languages is fourteen, which is defensible;
 * nothing here should ever let a configuration mistake turn into sixty. The cap is enforced where
 * the plan is BUILT rather than where it is run, so the operator can be shown the real number
 * before anything is spent.
 */
export const MAX_QUERIES = 16;

export interface PlannedQuery {
  angle: string;
  lang: QueryLang;
  query: string;
}

export interface PlanInput {
  name: string;
  kind: EntityKind;
  anchors: string[];
  aliases: string[];
  angleIds: string[];
  languages: QueryLang[];
}

export function angleById(kind: EntityKind, id: string): Angle | undefined {
  return ANGLES[kind].find((a) => a.id === id);
}

/**
 * Build the searches for one entity.
 *
 * Aliases get ONE extra query rather than a full set per alias: a former company name or a Chinese
 * name is worth finding pages under, but multiplying every angle by every alias is how a source
 * quietly starts costing five times what the operator agreed to.
 */
export function buildQueryPlan(input: PlanInput): PlannedQuery[] {
  const name = input.name.trim();
  if (!name) return [];
  const anchor = (input.anchors.find((a) => a.trim()) ?? "").trim();
  const langs = input.languages.length ? input.languages : (["zh", "en"] as QueryLang[]);

  const out: PlannedQuery[] = [];
  const seen = new Set<string>();
  const push = (angle: string, lang: QueryLang, raw: string) => {
    const query = raw.replace(/\{name\}/g, name).replace(/\{anchor\}/g, anchor).replace(/\s+/g, " ").trim();
    // Two angles can collapse to the same string once an empty {anchor} is substituted away.
    // Paying twice for one query is the kind of waste nobody ever notices in a bill.
    if (!query || seen.has(query)) return;
    seen.add(query);
    out.push({ angle, lang, query });
  };

  // Angle-major, not language-major: when the cap truncates the list, what survives is every angle
  // in the first language rather than the first three angles in both.
  for (const id of input.angleIds) {
    const angle = angleById(input.kind, id);
    if (!angle) continue;
    for (const lang of langs) {
      const template = angle.templates[lang];
      if (template) push(id, lang, template);
    }
  }

  for (const alias of input.aliases) {
    if (alias.trim()) push("alias", langs[0], `"${alias.trim()}" ${anchor}`);
  }

  return out.slice(0, MAX_QUERIES);
}

export function parseLanguages(value: unknown): QueryLang[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\s]+/)
    .map((l) => l.trim().toLowerCase())
    .filter((l): l is QueryLang => l === "zh" || l === "en");
}
