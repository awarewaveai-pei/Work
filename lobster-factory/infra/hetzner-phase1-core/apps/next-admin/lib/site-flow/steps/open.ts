// Step 9 正式開放 (SITE-FLOW-COMPLETION-PLAN.md §1-3 "正式開放"): `site-wp <slug> open` turns under-construction off
// and blog_public on. verify asks the public URL itself: the under-construction page answers 503 with the marker
// below (aw-hosting-gate.sh UC_PLUGIN), so "not that page" is the proof. rollback = `site-wp close`.
// The URL asked is a page WordPress does not have, never "/": on a shared-domain site (ingress product-gateway) the
// home page can belong to another service, which would answer 200 while WordPress is still under construction.
//
// Traps:
// - No read-only gate verb reports the under-construction option, so the observation is the newest open/close run
//   (I1: last run) on top of step 5 being done; a later close by hand on the host is not seen here.
// - The public request goes out from next-admin; when it cannot reach the site (network), verify fails and the
//   rollback closes the site again: an unproven "open" is never reported as done.

import type { SiteStepDefinition, StepPlan } from "../types";
import { gateTargetOf } from "../gate-client";
import { gateText, no, ok } from "./shared";

/** = aw-hosting-gate.sh UC_PLUGIN body text. */
export const UNDER_CONSTRUCTION_MARK = "網站建置中 · Coming soon";
/** A path no product gateway routes away from the site and WordPress has no page for (open = its 404). */
export const OPEN_PROBE_PATH = "/aw-open-check/";
const FETCH_TIMEOUT_MS = 15_000;

export async function publicSiteIsOpen(domain: string, fetchImpl: typeof fetch = fetch): Promise<{ open: boolean; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://${domain}${OPEN_PROBE_PATH}`, { redirect: "manual", signal: ctrl.signal, headers: { "cache-control": "no-cache" } });
    const body = res.status === 503 ? await res.text().catch(() => "") : "";
    if (res.status === 503 && body.includes(UNDER_CONSTRUCTION_MARK)) return { open: false, detail: "網站仍是建置中頁面" };
    if (res.status >= 500) return { open: false, detail: `網站回 ${res.status}` };
    return { open: true, detail: `網站回 ${res.status}，不是建置中頁面` };
  } catch (e) {
    return { open: false, detail: `無法從伺服器打開網站（${e instanceof Error ? e.message : String(e)}）` };
  } finally {
    clearTimeout(timer);
  }
}

export const openStep: SiteStepDefinition = {
  key: "open",
  title: "正式開放",
  requires: ["vhost"],
  timeoutMs: 10 * 60_000,

  async observe(ctx) {
    const last = (await ctx.history("open"))[0] ?? null;
    if (last?.status === "completed") return { status: "done", detail: `已正式開放（${last.started_at}）` };
    return { status: "absent", detail: "建置中：訪客看到維護頁" };
  },
  async plan(ctx): Promise<StepPlan> {
    const t = gateTargetOf(ctx.environment);
    if (!t.slug || !t.domain) throw new Error("環境缺少主機代號或網址");
    return {
      summary: `關掉 ${t.domain} 的建置中模式，讓訪客與搜尋引擎看得到`,
      items: [
        { label: "建置中頁面", value: "關閉" },
        { label: "搜尋引擎收錄", value: "允許（blog_public=1）" },
        { label: "確認方式", value: `從伺服器打開 https://${t.domain}${OPEN_PROBE_PATH}，不是建置中頁面才算完成` },
      ],
      rollback: "確認不到時自動改回建置中",
      params: { slug: t.slug, domain: t.domain },
    };
  },
  async precheck() {
    return ok("第 5 步已完成");
  },
  async execute(ctx) {
    const r = await ctx.gate.wp("open");
    return r.ok && r.data.state === "open" ? ok("主機回報：已開放") : no(r.ok ? `主機回報 ${String(r.data.state)}` : gateText(r));
  },
  async verify(_ctx, plan) {
    const r = await publicSiteIsOpen(String(plan.params.domain));
    return r.open ? ok(r.detail) : no(r.detail);
  },
  async rollback(ctx) {
    const r = await ctx.gate.wp("close");
    return r.ok ? ok("已改回建置中") : no(`改回建置中失敗：${gateText(r)}`);
  },
};
