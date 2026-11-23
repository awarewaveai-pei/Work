// Step 3 安裝 WordPress 與外掛 (SITE-FLOW-COMPLETION-PLAN.md §1-3 "裝 WP＋外掛", card SF-H items 1, 2, 5, 6).
//
// execute: `site-wp <slug> install <email> <locale>` only -- it is what yields the one-time admin password. The step
// then answers `pending`; every poll calls verify, which makes AT MOST ONE changing gate call (each <= the 90 s SSH
// timeout, so no request passes Cloudflare's ~100 s) and keeps its place in ctx.progress:
//   0 = install (again: "reused"; only when execute's own install outlived the SSH call), 1..n = `site-wp plugins`
//   batches, n+1 = `set-oracle-engine-url` when the oracle plugin is chosen. Done = EVERY planned plugin in the gate's
//   installed-and-activated list (item 6) and the engine URL the gate read back equals the input (item 5).
// A call that outlives the SSH timeout (`plugins` exports the whole database first, so it can on a large site) or the
// gate's "another ... is running" (our own earlier call still finishing under the slug lock) answers `pending` at the
// same place; the next poll repeats that call, which is idempotent.
// mode reset_password: `site-wp <slug> reset-admin-password`, the way back when the password was lost (item 2).
//
// Traps:
// - The admin password exists only in the gate's answer and in `reveal`. Stage `output` is built from named fields
//   (never the gate's object), so it cannot carry the password into ops_action_runs.
// - Observation = container healthy (preflight) + the newest completed install run's verified plugin list (I1: host
//   probe + last run). There is no read-only gate verb for WordPress state yet.
// - Kadence is a theme: the gate installs and activates it in `install`; it is never in the plugin list.
// - Engine URL (server) for aware-wave-oracle (item 5): input checked with the gate's own grammar (ENGINE_URL_RE), so
//   a value the gate would DENY never reaches the plan.

import type { InputCheck, ReadContext, RunFacts, SiteStepDefinition, StepContext, StepPlan, StepResult } from "../types";
import { ENGINE_URL_RE, gateTargetOf, isGateTimeout, isLockBusy, WP_EMAIL_MAX, WP_EMAIL_RE, WP_LOCALE_RE, type GateCall } from "../gate-client";
import { ownReleasePlugins, resolveSiteFlowPlugins, type WpPluginModule } from "@/lib/wp-plugin-stack-catalog";
import { gateText, HEALTHY, no, ok, readPreflight, stageOutput, unknown } from "./shared";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export const ORACLE_PLUGIN = "aware-wave-oracle";
const PACKS: readonly WpPluginModule[] = ["base", "ecommerce", "pod", "tourism", "brand"];
/** = aw-hosting-gate.sh: plugins takes 1-20 args; the whole command is at most MAX_SITE_CMD (4096) bytes. */
const MAX_PLUGIN_ARGS = 20;
const MAX_CMD = 4096;

// ── input ────────────────────────────────────────────────────────────────────

export interface WpInstallInput {
  mode: "install" | "reset_password";
  admin_email: string;
  optional_plugins: string[];
  oracle_server_url: string;
}

const optionalOwn = (): string[] => ownReleasePlugins().filter((p) => !p.required).map((p) => p.slug);

const serverUrlOk = (raw: string): boolean => ENGINE_URL_RE.test(raw);

export function parseWpInstallInput(raw: unknown): InputCheck {
  const b = isObj(raw) ? raw : {};
  const mode = b.mode === undefined || b.mode === "install" ? "install" : b.mode === "reset_password" ? "reset_password" : null;
  if (!mode) return { ok: false, error: "mode 只能是 install 或 reset_password" };
  if (mode === "reset_password") return { ok: true, input: { mode } };
  const email = typeof b.admin_email === "string" ? b.admin_email.trim().toLowerCase() : "";
  if (!email || email.length > WP_EMAIL_MAX || !WP_EMAIL_RE.test(email)) {
    return { ok: false, error: `請填管理員 email（${WP_EMAIL_MAX} 字以內）` };
  }
  const opts = Array.isArray(b.optional_plugins) ? b.optional_plugins : [];
  const allowed = optionalOwn();
  if (!opts.every((p) => typeof p === "string" && allowed.includes(p))) return { ok: false, error: "選了不在清單內的外掛" };
  const optional = allowed.filter((p) => (opts as string[]).includes(p)); // catalog order, no duplicates
  const url = typeof b.oracle_server_url === "string" ? b.oracle_server_url.trim() : "";
  if (optional.includes(ORACLE_PLUGIN)) {
    if (!serverUrlOk(url)) return { ok: false, error: "請填命理外掛的「引擎網址（伺服器用）」：http(s)://小寫主機名[:埠]，不帶路徑、斜線結尾或帳密，例 http://oracle-web:3000" };
  } else if (url) {
    return { ok: false, error: "沒有選命理外掛，不需要引擎網址" };
  }
  return { ok: true, input: { mode, admin_email: email, optional_plugins: optional, oracle_server_url: url } };
}

const inputOf = (ctx: ReadContext): WpInstallInput => ({
  mode: ctx.input.mode === "reset_password" ? "reset_password" : "install",
  admin_email: typeof ctx.input.admin_email === "string" ? ctx.input.admin_email : "",
  optional_plugins: Array.isArray(ctx.input.optional_plugins) ? (ctx.input.optional_plugins as string[]) : [],
  oracle_server_url: typeof ctx.input.oracle_server_url === "string" ? ctx.input.oracle_server_url : "",
});

// ── what to install ──────────────────────────────────────────────────────────

/** sites.locale -> WordPress locale (gate LOCALE_RE). zh-TW / zh_TW -> zh_TW; en / missing -> en_US. */
export function wpLocaleOf(locale: string | null | undefined): string {
  const v = (locale ?? "").replace("-", "_");
  if (!v || v === "en") return "en_US";
  return WP_LOCALE_RE.test(v) ? v : "en_US";
}

export function packsOf(envMetadata: Json): WpPluginModule[] {
  const raw = Array.isArray(envMetadata.plugin_packs) ? envMetadata.plugin_packs : [];
  return PACKS.filter((p) => p === "base" || raw.includes(p));
}

/** The args of `site-wp plugins` for this site: WordPress.org slugs, then own release URLs. */
export function pluginArgs(envMetadata: Json, optional: readonly string[]): string[] {
  const { wporg, releases } = resolveSiteFlowPlugins(packsOf(envMetadata), optional);
  return [...wporg, ...releases.map((r) => r.url)];
}

/** Splits plugin args into gate calls: at most 20 args and MAX_CMD bytes each. */
export function pluginBatches(slug: string, args: readonly string[]): string[][] {
  const head = `site-wp ${slug} plugins`.length;
  const out: string[][] = [];
  let cur: string[] = [];
  let len = head;
  for (const a of args) {
    if (cur.length > 0 && (cur.length >= MAX_PLUGIN_ARGS || len + 1 + a.length > MAX_CMD)) {
      out.push(cur);
      cur = [];
      len = head;
    }
    cur.push(a);
    len += 1 + a.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

const pending = (detail: string, progress?: Json): StepResult => ({ ok: false, pending: true, detail, ...(progress ? { progress } : {}) });
/** A call our own earlier request may still be finishing (it outlived the SSH timeout) or holding (slug lock). */
const stillWorking = (r: GateCall<unknown>) => isGateTimeout(r) || isLockBusy(r);

/** Where verify is (stored by the engine between polls). */
interface Cursor {
  next: number;
  done: string[];
  wp_state: string;
  admin_user: string;
  lost_password: boolean;
}
const cursorOf = (v: Json | undefined): Cursor => ({
  next: typeof v?.next === "number" ? v.next : 0,
  done: Array.isArray(v?.done) ? (v!.done as string[]) : [],
  wp_state: typeof v?.wp_state === "string" ? v.wp_state : "",
  admin_user: typeof v?.admin_user === "string" ? v.admin_user : "",
  lost_password: v?.lost_password === true,
});
const asJson = (c: Cursor): Json => ({ ...c });

// ── the step ─────────────────────────────────────────────────────────────────

async function containerUp(ctx: Pick<ReadContext, "gate">): Promise<StepResult> {
  const r = await readPreflight(ctx);
  if ("detail" in r) return no(r.detail);
  return r.pf.wpContainer === HEALTHY ? ok("網站容器運作中") : no(`網站容器狀態是 ${r.pf.wpContainer || "未知"}，請先完成第 2 步`);
}

/** One changing gate call (the one at the cursor), then pending with the next place, or the final answer. */
async function convergeOneCall(ctx: StepContext, plan: StepPlan): Promise<StepResult> {
  const p = plan.params;
  const c = cursorOf(ctx.progress);
  const wanted = Array.isArray(p.plugins) ? (p.plugins as string[]) : [];
  const batches = pluginBatches(String(p.slug), wanted);
  const engineUrl = typeof p.oracle_server_url === "string" ? p.oracle_server_url : "";
  const last = batches.length + (engineUrl ? 1 : 0);
  const out = (extra: Json = {}): Json => ({ wp_state: c.wp_state, admin_user: c.admin_user, plugins_verified: wanted.filter((a) => c.done.includes(a)), ...extra });

  if (c.next === 0) {
    const r = await ctx.gate.wp("install", [String(p.admin_email), String(p.locale)]);
    if (stillWorking(r)) return pending("主機仍在安裝 WordPress，稍後會再確認", asJson(c));
    if ("detail" in r) return no(gateText(r), out());
    // A fresh install here means execute's own install never ran to the end: its password was never shown and this
    // one is dropped on purpose (verify has no reveal). The operator resets it.
    c.wp_state = String(r.data.state ?? "");
    c.admin_user = String(r.data.admin_user ?? "");
    c.lost_password ||= c.wp_state === "installed";
    c.next = 1;
  } else if (c.next <= batches.length) {
    const r = await ctx.gate.wp("plugins", batches[c.next - 1]);
    if (stillWorking(r)) return pending(`主機仍在安裝外掛（第 ${c.next}/${batches.length} 批；已確認 ${c.done.length}/${wanted.length}）`, asJson(c));
    if ("detail" in r) return no(`外掛安裝失敗：${gateText(r)}`, out());
    const got = String(r.data.plugins ?? "").split(" ").filter(Boolean);
    c.done = [...new Set([...c.done, ...got])];
    const missing = batches[c.next - 1].filter((a) => !got.includes(a));
    if (missing.length) return no(`主機沒有確認這些外掛已啟用：${missing.join("、")}`, out());
    c.next += 1;
  } else if (engineUrl && c.next === batches.length + 1) {
    // item 5: the oracle plugin's server-side engine URL, written by the gate and read back by it.
    const r = await ctx.gate.wp("set-oracle-engine-url", [engineUrl]);
    if (stillWorking(r)) return pending("主機仍在寫入命理外掛的引擎網址", asJson(c));
    if ("detail" in r) return no(`命理外掛的引擎網址沒有寫入：${gateText(r)}`, out());
    if (r.data.server_engine_url !== engineUrl) return no(`命理外掛的引擎網址讀回是 ${String(r.data.server_engine_url ?? "")}，不是 ${engineUrl}`, out());
    c.next += 1;
    return finish(c, wanted, engineUrl, out({ oracle_server_url_verified: engineUrl }));
  }
  if (c.next <= last) return pending(`已完成 ${c.next - 1}/${last} 個主機動作，接著做下一個`, asJson(c));
  return finish(c, wanted, engineUrl, out());
}

function finish(c: Cursor, wanted: string[], engineUrl: string, output: Json): StepResult {
  const missing = wanted.filter((a) => !c.done.includes(a));
  if (missing.length) return no(`主機沒有確認這些外掛已啟用：${missing.join("、")}`, output);
  return ok(
    `WordPress 已安裝；外掛 ${wanted.length} 個已確認啟用${engineUrl ? `；命理外掛引擎網址已寫入 ${engineUrl}` : ""}${c.lost_password ? "；這次安裝的密碼沒有顯示，請按「重設管理員密碼」" : ""}`,
    output,
  );
}

export const wpInstallStep: SiteStepDefinition = {
  key: "wp_install",
  title: "安裝 WordPress 與外掛",
  requires: ["create"],
  timeoutMs: 45 * 60_000,
  parseInput: parseWpInstallInput,

  async observe(ctx) {
    const pre = await readPreflight(ctx);
    if ("detail" in pre) return unknown(pre.detail);
    if (pre.pf.wpContainer !== HEALTHY) return { status: "absent", detail: "網站主機還沒啟動" };
    // Attempts that never reached the host (plan/precheck refused, slug lock busy: no stage output) say nothing about it.
    const reachedHost = (r: RunFacts) => !!(stageOutput(r, "execute", false) || stageOutput(r, "verify", false));
    const runs = (await ctx.history("wp_install")).filter((r) => r.input.mode !== "reset_password" && (r.status === "completed" || reachedHost(r)));
    // The newest attempt decides (a failed re-run with other plugins must not hide behind an older success).
    const newest = runs[0] ?? null;
    const completed = newest?.status === "completed" ? newest : null;
    if (newest && !completed) {
      const installed = ["installed", "reused"].includes(String(stageOutput(newest, "execute", false)?.wp_state ?? stageOutput(newest, "verify", false)?.wp_state ?? ""));
      return installed ? { status: "partial", detail: "WordPress 已安裝，上次的外掛或設定沒有全部完成" } : { status: "absent", detail: "上次安裝沒有成功" };
    }
    if (completed) {
      const verified = stageOutput(completed, "verify")?.plugins_verified;
      const have = new Set(Array.isArray(verified) ? (verified as string[]) : []);
      const optional = Array.isArray(completed.input.optional_plugins) ? (completed.input.optional_plugins as string[]) : [];
      const wanted = pluginArgs(ctx.environment.metadata, optional);
      const missing = wanted.filter((a) => !have.has(a));
      if (missing.length) return { status: "partial", detail: `外掛清單有 ${missing.length} 個還沒裝：${missing.join("、")}` };
      // item 5: the engine URL counts only as the value the gate read back after writing it
      const url = typeof completed.input.oracle_server_url === "string" ? completed.input.oracle_server_url : "";
      if (url && stageOutput(completed, "verify")?.oracle_server_url_verified !== url) {
        return { status: "partial", detail: "命理外掛的引擎網址沒有確認寫入" };
      }
      return { status: "done", detail: `WordPress 已安裝；外掛 ${wanted.length} 個已確認啟用${url ? `；引擎網址 ${url}` : ""}`, facts: { plugins: wanted.length } };
    }
    return { status: "absent", detail: "還沒安裝" };
  },

  async plan(ctx): Promise<StepPlan> {
    const t = gateTargetOf(ctx.environment);
    if (!t.slug) throw new Error("環境缺少主機代號");
    const input = inputOf(ctx);
    if (input.mode === "reset_password") {
      return {
        summary: "重設這個站的管理員密碼（新密碼只顯示這一次，系統不保存）",
        items: [{ label: "帳號", value: "第一個管理員帳號" }],
        rollback: "不需還原；舊密碼失效",
        params: { mode: "reset_password", slug: t.slug },
      };
    }
    if (packsOf(ctx.environment.metadata).includes("tourism")) {
      throw new Error("旅遊站用 TravelWP 佈景，這一步會裝 Kadence：旅遊站的安裝還不在建站流程，請工程師處理");
    }
    const locale = wpLocaleOf(ctx.site.locale);
    const plugins = pluginArgs(ctx.environment.metadata, input.optional_plugins);
    const own = ownReleasePlugins().filter((r) => plugins.includes(r.url));
    const items = [
      { label: "網址", value: `https://${t.domain ?? ""}` },
      { label: "管理員帳號（email）", value: input.admin_email },
      { label: "管理員密碼", value: "主機產生，只在這一次顯示，系統不保存（忘了用「重設管理員密碼」）" },
      { label: "語系", value: locale },
      { label: "佈景", value: "Kadence" },
      { label: "WordPress.org 外掛", value: plugins.filter((a) => !a.startsWith("https://")).join("、") },
      { label: "自有外掛（固定版本）", value: own.map((r) => `${r.slug}（${r.url}）`).join("、") || "無" },
      { label: "網站狀態", value: "建置中：訪客看到維護頁，登入後台可用" },
    ];
    if (input.optional_plugins.includes(ORACLE_PLUGIN)) {
      items.push({ label: "命理外掛引擎網址（伺服器用）", value: `${input.oracle_server_url}（寫入外掛設定 server_engine_url，其他設定不動）` });
      // A dotless host (a container name) resolves only on the shared lobster-net, which only product-gateway sites join.
      if (!new URL(input.oracle_server_url).hostname.includes(".") && ctx.environment.metadata?.ingress !== "product-gateway") {
        items.push({ label: "注意", value: "這個引擎網址是主機內部名稱，只有接產品閘道的站連得到；這個站不是，請改用公開網址" });
      }
    }
    return {
      summary: "安裝 WordPress、Kadence 佈景與選定的外掛",
      items,
      rollback: "外掛失敗時主機用安裝前的資料庫匯出還原；WordPress 本體保留，修正後可重跑",
      params: { mode: "install", slug: t.slug, admin_email: input.admin_email, locale, plugins, oracle_server_url: input.oracle_server_url },
    };
  },

  async precheck(ctx) {
    return containerUp(ctx);
  },

  async execute(ctx, plan) {
    const p = plan.params;
    if (p.mode === "reset_password") {
      const r = await ctx.gate.wp("reset-admin-password");
      if ("detail" in r) return no(gateText(r));
      const user = String(r.data.admin_user ?? "");
      const pw = r.data.admin_password;
      if (typeof pw !== "string" || !pw) return no("主機沒有回傳新密碼");
      return { ok: true, detail: `已重設 ${user} 的密碼`, output: { admin_user: user }, reveal: { 管理員帳號: user, 管理員密碼: pw } };
    }
    const r = await ctx.gate.wp("install", [String(p.admin_email), String(p.locale)]);
    if (isGateTimeout(r)) {
      return pending("主機回覆逾時，但仍在安裝；密碼無法顯示，完成後請按「重設管理員密碼」。外掛接著由頁面自動確認", asJson({ ...cursorOf(undefined), lost_password: true }));
    }
    if (isLockBusy(r)) return no("這個站有另一個主機操作正在進行，請稍後再按");
    if ("detail" in r) return no(gateText(r));
    const state = String(r.data.state ?? "");
    const user = String(r.data.admin_user ?? "");
    const pw = r.data.admin_password;
    const reveal = typeof pw === "string" && pw ? { 管理員帳號: user, 管理員密碼: pw } : undefined;
    return {
      ok: false,
      pending: true,
      detail: `WordPress ${state === "installed" ? "已安裝" : "原本就裝好了"}；外掛接著安裝，這一頁會自動更新${reveal ? "" : "（這次沒有新密碼：忘了請按「重設管理員密碼」）"}`,
      output: { wp_state: state, admin_user: user },
      progress: asJson({ next: 1, done: [], wp_state: state, admin_user: user, lost_password: false }),
      ...(reveal ? { reveal } : {}),
    };
  },

  async verify(ctx, plan) {
    if (plan.params.mode === "reset_password") return containerUp(ctx);
    return convergeOneCall(ctx, plan);
  },

  async rollback(_ctx, plan) {
    if (plan.params.mode === "reset_password") return ok("不需還原");
    return ok("不需另外還原：外掛失敗時主機已用安裝前的資料庫匯出還原資料庫；WordPress 本體與建置中模式保留，修正後可重跑");
  },
};
