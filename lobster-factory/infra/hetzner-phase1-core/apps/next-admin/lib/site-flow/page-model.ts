// What the site-flow pages show (SITE-FLOW-COMPLETION-PLAN.md §2, card SF-J). Pure and client-safe: no ssh2, no db.
// The engine (engine.ts) owns every rule about what may run; this file only turns its answers into words and buttons.
//
// Traps:
// - The 9 steps of §2 are a display list. Only 7 have an engine step (SITE_STEP_KEYS); 每日備份 and 手動項目 have no
//   engine key yet, so they render as "尚未提供" rather than storing a tick the page invented (I1: no stored done flag).
// - A step whose catalog switch is off shows "此步驟尚未開放" and its button cannot be pressed, even to preview.
// - SITE_SLUG_RE / SITE_DOMAIN_RE repeat gate-client.ts (that file pulls in ssh2, which a browser bundle cannot take);
//   page-model.test.ts asserts they are the same expressions.

import type { SiteStepKey, StepState } from "./types";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export interface FlowStepDef {
  /** 1-based position on the page. */
  no: number;
  /** The engine step behind it; null = no engine step yet. */
  engineKey: SiteStepKey | null;
  title: string;
  /** What this step does, one sentence, shown even when the step cannot run yet. */
  what: string;
  /** Button text that opens the preview (steps that touch the host are two presses: preview, then confirm). */
  previewLabel: string;
}

export const FLOW_STEPS: readonly FlowStepDef[] = [
  { no: 1, engineKey: "preflight", title: "網址檢查", what: "看這個網址有沒有指到 AwareWave 的主機、安全憑證有沒有涵蓋、現在有沒有別的站在用。", previewLabel: "重新檢查" },
  { no: 2, engineKey: "create", title: "建立網站主機", what: "在主機上建立這個站的容器與資料庫，並列入每日備份。", previewLabel: "看要做什麼" },
  { no: 3, engineKey: "wp_install", title: "安裝 WordPress 與外掛", what: "裝好 WordPress 與選定的外掛。管理員密碼只會顯示一次。", previewLabel: "看要做什麼" },
  { no: 4, engineKey: null, title: "每日備份", what: "顯示這個站有沒有列入每日備份，以及最近一次備份的時間。", previewLabel: "看要做什麼" },
  { no: 5, engineKey: "vhost", title: "掛上網址", what: "把網址連到這個站；上線前訪客只會看到維護頁。", previewLabel: "看要做什麼" },
  { no: 6, engineKey: "mainwp", title: "接上 MainWP", what: "把這個站加進 MainWP，之後可以集中更新。", previewLabel: "看要做什麼" },
  { no: 7, engineKey: "bridge", title: "接上 AI 控制通道", what: "裝上並連通 wp-bridge，讓系統能代操作這個站。", previewLabel: "看要做什麼" },
  { no: 8, engineKey: null, title: "手動項目", what: "加入監控（Uptime Kuma）、WPvivid 遠端備份、寄信設定；在對應系統做完後回來確認。", previewLabel: "看要做什麼" },
  { no: 9, engineKey: "open", title: "正式開放", what: "關掉建置中模式，搜尋引擎才能收錄。", previewLabel: "看要做什麼" },
];

/** The step shape GET /api/ops/site-flow/[siteId] answers (engine.ts StepStatus, JSON form). */
export interface ApiStep {
  key: SiteStepKey;
  title: string;
  enabled: boolean;
  state: StepState;
  reason: string | null;
  observation: { status: string; detail: string } | null;
  lastRun: { id: string; status: string; started_at: string; ended_at: string | null; error_summary: string | null } | null;
}

export type Tone = "green" | "red" | "gray" | "yellow" | "accent";

export interface StepView {
  def: FlowStepDef;
  stateLabel: string;
  tone: Tone;
  /** Why the step is in this state, in words (a blocked reason, a failure reason, "尚未提供"). */
  reason: string | null;
  /** The one button this step offers; null = none. `disabled` explains itself in `label`. */
  action: { kind: "plan" | "poll" | "refresh"; label: string; disabled: boolean } | null;
  running: boolean;
  runId: string | null;
}

const STATE_LABEL: Record<StepState, { text: string; tone: Tone }> = {
  not_started: { text: "未開始", tone: "gray" },
  ready: { text: "可以做", tone: "accent" },
  blocked: { text: "被擋住", tone: "yellow" },
  running: { text: "執行中", tone: "yellow" },
  done: { text: "完成", tone: "green" },
  failed: { text: "失敗", tone: "red" },
  not_available: { text: "尚未提供", tone: "gray" },
};

export const CLOSED_SWITCH_LABEL = "此步驟尚未開放";

/** One step's view. `api` is null before the first answer arrives or when the engine has no such step. */
export function viewOf(def: FlowStepDef, api: ApiStep | null): StepView {
  if (!def.engineKey || !api) {
    return { def, stateLabel: STATE_LABEL.not_available.text, tone: "gray", reason: def.engineKey ? null : "此步驟尚未提供", action: null, running: false, runId: null };
  }
  const s = STATE_LABEL[api.state];
  const base = { def, stateLabel: s.text, tone: s.tone, reason: api.reason, running: api.state === "running", runId: api.lastRun?.id ?? null };
  if (api.state === "not_available") return { ...base, action: null };
  if (api.state === "running") return { ...base, action: { kind: "poll", label: "查看進度", disabled: false } };
  // The catalog switch is the per-step key (I6): off = nothing to preview, whatever the state says.
  if (!api.enabled && api.state !== "done" && api.state !== "blocked") return { ...base, reason: CLOSED_SWITCH_LABEL, action: { kind: "plan", label: CLOSED_SWITCH_LABEL, disabled: true } };
  if (api.state === "ready") return { ...base, action: { kind: "plan", label: def.previewLabel, disabled: false } };
  if (api.state === "failed") return { ...base, action: { kind: "plan", label: `重試：${def.previewLabel}`, disabled: false } };
  // The preflight read is repeatable at any time (§2 step 1).
  if (def.engineKey === "preflight" && api.state !== "blocked") return { ...base, action: { kind: "refresh", label: "重新檢查", disabled: false } };
  return { ...base, action: null };
}

/** A step is "ahead" of the first unfinished one: only the next step to do is expanded by default. */
export function firstOpenStep(views: readonly StepView[]): number {
  const i = views.findIndex((v) => v.def.engineKey !== null && v.stateLabel !== STATE_LABEL.done.text);
  return i < 0 ? -1 : i;
}

export function doneCount(views: readonly StepView[]): number {
  return views.filter((v) => v.stateLabel === STATE_LABEL.done.text).length;
}

// ── new-site form ────────────────────────────────────────────────────────────

/** `https://Oracle.Aware-Wave.com/x` -> `oracle.aware-wave.com`, or null when it is not a plain domain. */
export function normalizeDomain(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return t.length <= 253 && DOMAIN_RE.test(t) ? t : null;
}

/** The host-side site code: the domain with dots as dashes, at most 40 characters (= gate SLUG_RE). */
export function hostSlugOf(domain: string): string | null {
  const s = domain.replace(/\./g, "-").slice(0, 40).replace(/-+$/, "");
  return SLUG_RE.test(s) ? s : null;
}

export const LOCALES = [
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
] as const;

export const PLUGIN_PACKS = [
  { value: "base", label: "基本包", note: "每個站都需要，固定包含", fixed: true },
  { value: "ecommerce", label: "電商包", note: "WooCommerce 與金流相關外掛", fixed: false },
  { value: "pod", label: "客製商品包", note: "印製商品相關外掛", fixed: false },
  { value: "tourism", label: "旅遊包", note: "旅遊網站佈景與外掛", fixed: false },
  { value: "brand", label: "品牌包", note: "品牌展示相關外掛", fixed: false },
] as const;

export type Locale = (typeof LOCALES)[number]["value"];
export type PackKey = (typeof PLUGIN_PACKS)[number]["value"];

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.value === v);
export const isPack = (v: unknown): v is PackKey => PLUGIN_PACKS.some((p) => p.value === v);

/** Words for a create-site error code (create-site.ts / records.ts RecordError). */
export function createErrorText(code: string): string {
  switch (code) {
    case "invalid_domain": return "網址格式不對，請填像 oracle.aware-wave.com 這樣的網址。";
    case "invalid_name": return "請填客戶名稱。";
    case "invalid_locale": case "invalid_pack": return "有一個選項不在清單內，請重新選。";
    case "host_slug_taken": return "這個網址已經有另一個站在使用主機代號，請換網址或先處理那個站。";
    case "site_scope_mismatch": case "idempotency_key_reused": return "這次建立的內容和先前送出的不同，請重新整理頁面後再建立。";
    case "slug_taken": return "這個網址對應的客戶代號已經存在，不會自動併進既有客戶。請確認網址，或先處理既有客戶。";
    case "environment_provider_conflict": return "這個站已經有正式環境，且主機類型不同。";
    case "forbidden": case "forbidden_role": return "只有擁有者與管理員可以建立網站。";
    case "supabase_write_not_configured": return "資料庫尚未連上。";
    default: return `建立失敗（${code}）。`;
  }
}

/** The paths of org metadata the create did not apply, as one sentence for the operator. */
export function keptKeysText(keys: readonly string[]): string | null {
  if (keys.length === 0) return null;
  return `這些值沒有套用，因為客戶已經有設定：${keys.join("、")}`;
}
