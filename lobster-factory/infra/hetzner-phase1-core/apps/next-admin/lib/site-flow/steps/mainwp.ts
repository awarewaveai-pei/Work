// Step 6 接上 MainWP (SITE-FLOW-COMPLETION-PLAN.md §1-3 "MainWP", card SF-I item 1).
//
// execute: MainWP already lists this install -> reuse its id (no new unique id: that would only matter at the next
// connect, and the site is connected already). Otherwise a fresh Unique Security ID goes to the site through the gate
// (`site-wp set-mainwp-id`, as provision-staging prepareMainWpChild does) and then to MainWP `sites/add`, which
// connects with it. The MainWP site id goes to environments.metadata.mainwp_site_id.
// Observation (I1) = MainWP itself: the install is listed and connected (mainwp-client.ts connectionOf).
//
// Traps:
// - The unique id is generated in execute and dropped: never in the plan (hash), a stage output or an error text.
// - Admin user: the one the gate's install reported (wp_install run output admin_user); a staging subdirectory site's
//   administrator is STAGING_ADMIN_USER. MainWP refuses an add without it.
// - rollback leaves MainWP alone (SITE-FLOW §1-3: removal from MainWP is by hand); a re-run reuses the listed site.
// - Listed but not connected: no REST call here repairs it (no reconnect route is verified against the installed
//   MainWP), so observe says blocked with the hand step and execute refuses instead of re-adding; once the operator
//   reconnects in MainWP, the observation turns done by itself.

import { randomBytes } from "node:crypto";
import type { ReadContext, RunFacts, SiteStepDefinition, StepPlan } from "../types";
import { STAGING_ADMIN_USER } from "../gate-client";
import { addMainWpSite, findMainWpSite, mainWpConfigFromEnv } from "../mainwp-client";
import { gateText, no, ok, patchEnvironmentMetadata, siteUrlOf, stageOutput, unknown } from "./shared";

const reconnectByHand = (id: string, why: string) => `MainWP 有這個站（#${id}），但${why}：請到 MainWP 對這個站按「Reconnect」，修好後這一步會自動顯示完成`;

const NO_CONFIG = "後台沒有 MainWP 設定（MAINWP_DASHBOARD_URL／MAINWP_CONSUMER_KEY／MAINWP_CONSUMER_SECRET）";

/** The WordPress administrator MainWP connects as; "" when unknown. */
export async function adminUserOf(ctx: Pick<ReadContext, "environment" | "history">): Promise<string> {
  if (ctx.environment.hosting_provider === "ks-aw-01-staging-subdir") return STAGING_ADMIN_USER;
  const runs = await ctx.history("wp_install");
  const userOf = (r: RunFacts) =>
    String(stageOutput(r, "verify", false)?.admin_user ?? stageOutput(r, "execute", false)?.admin_user ?? "").trim();
  for (const r of [...runs.filter((x) => x.status === "completed"), ...runs.filter((x) => x.status !== "completed")]) {
    const u = userOf(r);
    if (u) return u;
  }
  return "";
}

export const mainwpStep: SiteStepDefinition = {
  key: "mainwp",
  title: "接上 MainWP",
  requires: ["vhost"],
  // A staging subdirectory site is served under aware-wave.com already; it has no host steps 1-5 (docker only).
  requiresOn: (env) => (env.hosting_provider === "ks-aw-01-staging-subdir" ? [] : ["vhost"]),
  timeoutMs: 10 * 60_000,

  async observe(ctx) {
    const cfg = mainWpConfigFromEnv();
    if (!cfg) return unknown(NO_CONFIG);
    const url = siteUrlOf(ctx.environment);
    if (!url) return unknown("環境沒有網址");
    const f = await findMainWpSite(cfg, url);
    if ("detail" in f) return unknown(f.detail);
    if (!f.site) return { status: "absent", detail: "MainWP 還沒有這個站" };
    if (f.site.connected === true) return { status: "done", detail: `MainWP 站 #${f.site.id}：${f.site.detail}`, facts: { mainwp_site_id: f.site.id } };
    return { status: "blocked", detail: reconnectByHand(f.site.id, f.site.detail), facts: { mainwp_site_id: f.site.id } };
  },

  async plan(ctx): Promise<StepPlan> {
    const url = siteUrlOf(ctx.environment);
    if (!url) throw new Error("環境沒有網址");
    const admin = await adminUserOf(ctx);
    if (!admin) throw new Error("找不到這個站的管理員帳號：請先完成第 3 步「安裝 WordPress 與外掛」");
    return {
      summary: `把 ${url} 加進 MainWP，之後由 MainWP 統一更新與備份`,
      items: [
        { label: "網址", value: url },
        { label: "MainWP 顯示名稱", value: ctx.site.name },
        { label: "連線用管理員帳號", value: admin },
        { label: "連線方式", value: "在站上設一次性連線碼（Unique Security ID），MainWP 用它連線；連線碼不保存" },
        { label: "MainWP 已有這個網址時", value: "沿用，不重複加站" },
        { label: "確認方式", value: "MainWP 回報這個站存在且連線正常" },
      ],
      rollback: "不自動從 MainWP 移除（依計畫為手動）：重跑會沿用已加入的站；要撤掉請到 MainWP 刪除這個站",
      params: { url, name: ctx.site.name, admin },
    };
  },

  async precheck() {
    return mainWpConfigFromEnv() ? ok("後台有 MainWP 設定") : no(NO_CONFIG);
  },

  async execute(ctx, plan) {
    const cfg = mainWpConfigFromEnv();
    if (!cfg) return no(NO_CONFIG);
    const p = plan.params;
    const url = String(p.url);
    const found = await findMainWpSite(cfg, url);
    if ("detail" in found) return no(found.detail);
    let id: string;
    let state: "added" | "reused";
    if (found.site) {
      if (found.site.connected !== true) return no(reconnectByHand(found.site.id, found.site.detail), { mainwp_site_id: found.site.id });
      id = found.site.id;
      state = "reused";
    } else {
      const uniqueId = randomBytes(24).toString("hex");
      const g = await ctx.gate.wp("set-mainwp-id", [uniqueId]);
      if ("detail" in g) return no(`站上設定 MainWP 連線碼失敗：${gateText(g)}`);
      const add = await addMainWpSite(cfg, { url, name: String(p.name), admin: String(p.admin), uniqueId });
      if (!("detail" in add)) {
        id = add.id;
        state = "added";
      } else if (add.foundId) {
        id = add.foundId;
        state = "reused";
      } else {
        return no(add.detail);
      }
    }
    const out = { mainwp_site_id: id, state };
    const w = await patchEnvironmentMetadata(ctx.db, ctx.environment.id, { mainwp_site_id: id });
    if ("detail" in w) return no(`MainWP 已有這個站（#${id}），但${w.detail}；重跑會沿用`, out);
    return ok(state === "added" ? `已加入 MainWP（#${id}）` : `MainWP 原本就有這個站（#${id}），沿用`, out);
  },

  async verify(_ctx, plan) {
    const cfg = mainWpConfigFromEnv();
    if (!cfg) return no(NO_CONFIG);
    const f = await findMainWpSite(cfg, String(plan.params.url));
    if ("detail" in f) return no(`無法向 MainWP 確認：${f.detail}`);
    if (!f.site) return no("MainWP 的站清單裡沒有這個站");
    if (f.site.connected !== true) return no(`MainWP 有這個站（#${f.site.id}），但${f.site.detail}`, { mainwp_site_id: f.site.id });
    return ok(`MainWP 站 #${f.site.id}：${f.site.detail}`, { mainwp_site_id: f.site.id });
  },

  async rollback() {
    return ok("未從 MainWP 移除（依計畫為手動）：重跑會沿用；要撤掉請到 MainWP 刪除這個站");
  },
};
