// Step 5 掛上網址 (SITE-FLOW-COMPLETION-PLAN.md §1-3 "掛網址上線", §1 #6).
// ingress=host-vhost: `site-vhost <slug>` writes this site's nginx vhost through safe-infra-patch.sh host-nginx-new
// (the gate re-checks occupancy and the certificate, and refuses an uninstalled WordPress).
// ingress=product-gateway: the URL is routed by the product gateway, which an engineer changes (blast radius = every
// product); the step is a manual tick (manual-checks.ts GATEWAY_CHECK) and execute refuses.
//
// Trap: done = the registry records this site's vhost file AND the live nginx config serves the domain from that file;
// a registry line without the live file is "partial".

import type { SiteStepDefinition, StepPlan } from "../types";
import { gateTargetOf } from "../gate-client";
import { gateText, ingress, no, ok, readPreflight, unknown, type Preflight } from "./shared";
import { GATEWAY_CHECK, tickOf } from "./manual-checks";

const vhostPath = (domain: string) => `/etc/nginx/sites-available/${domain}.conf`; // = render.sh client_wp_vhost_file

export function vhostState(pf: Preflight, domain: string): { status: "done" | "partial" | "absent" | "blocked" | "unknown"; detail: string } {
  if (!pf.registry) return { status: "absent", detail: "主機還沒有這個站的登記（先完成第 2 步）" };
  const mine = vhostPath(domain);
  if (pf.occupants === null) return { status: "unknown", detail: `無法讀取主機的網站設定（${pf.occupantsError || "nginx -T 失敗"}）` };
  const live = pf.occupants.some((o) => o.file === mine || o.target === mine);
  if (pf.registry.vhost_file) {
    return live ? { status: "done", detail: `網址已連到這個站（${mine}）` } : { status: "partial", detail: `登記檔記著 ${pf.registry.vhost_file}，但主機目前沒有用它提供這個網址` };
  }
  const others = pf.occupants.filter((o) => o.file !== mine && o.target !== mine);
  if (others.length) return { status: "blocked", detail: `這個網址已經有別的站在用：${others.map((o) => o.file).join("、")}` };
  if (!pf.certs.length) return { status: "blocked", detail: "主機上沒有涵蓋這個網址的有效安全憑證" };
  if (live) return { status: "partial", detail: "網站設定已上線但登記檔沒記錄（重跑會接手）" };
  return { status: "absent", detail: "還沒掛上網址" };
}

export const vhostStep: SiteStepDefinition = {
  key: "vhost",
  title: "掛上網址",
  requires: ["wp_install"],
  timeoutMs: 15 * 60_000,
  manual: (env) => (ingress(env) === "product-gateway" ? { key: GATEWAY_CHECK.key, label: GATEWAY_CHECK.label } : null),

  async observe(ctx) {
    if (ingress(ctx.environment) === "product-gateway") {
      const t = tickOf(ctx.site.metadata, GATEWAY_CHECK.key);
      return t
        ? { status: "done", detail: `您手動確認：${GATEWAY_CHECK.label}（${t.by || "未記名"}，${t.at}${t.note ? `，${t.note}` : ""}）` }
        : { status: "absent", detail: "由工程師在產品閘道設定；完成後在這裡勾選" };
    }
    const domain = gateTargetOf(ctx.environment).domain ?? "";
    const r = await readPreflight(ctx);
    if ("detail" in r) return unknown(r.detail);
    return vhostState(r.pf, domain);
  },

  async plan(ctx): Promise<StepPlan> {
    if (ingress(ctx.environment) !== "host-vhost") throw new Error("這個站的網址由產品閘道設定，不在這裡執行");
    const t = gateTargetOf(ctx.environment);
    if (!t.slug || !t.domain) throw new Error("環境缺少主機代號或網址");
    const r = await readPreflight(ctx);
    if ("detail" in r) throw new Error(r.detail);
    return {
      summary: `把 ${t.domain} 連到這個站（訪客先看到建置中頁面）`,
      items: [
        { label: "網站設定檔", value: vhostPath(t.domain) },
        { label: "啟用連結", value: `/etc/nginx/sites-enabled/${t.domain}.conf` },
        { label: "安全憑證", value: r.pf.certs[0]?.dir ?? "（沒有涵蓋的憑證：主機會拒絕）" },
        { label: "轉到", value: `127.0.0.1:${r.pf.registry?.port ?? "?"}` },
      ],
      rollback: "主機套用失敗時自動移除設定檔與連結並重載 nginx；已上線的網址要撤下只能在主機執行",
      params: { slug: t.slug, domain: t.domain, cert: r.pf.certs[0]?.dir ?? null },
    };
  },

  async precheck(ctx) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(r.detail);
    const s = vhostState(r.pf, gateTargetOf(ctx.environment).domain ?? "");
    return s.status === "blocked" || s.status === "unknown" ? no(s.detail) : ok(s.detail);
  },
  async execute(ctx) {
    const r = await ctx.gate.vhost();
    return r.ok ? ok(`主機回報：${String(r.data.state ?? "")}`, { state: String(r.data.state ?? ""), vhost_file: String(r.data.vhost_file ?? "") }) : no(gateText(r));
  },
  async verify(ctx, plan) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(r.detail);
    const s = vhostState(r.pf, String(plan.params.domain));
    return s.status === "done" ? ok(s.detail) : no(s.detail);
  },
  async rollback(ctx, plan) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(`無法確認主機現況：${r.detail}`);
    const mine = vhostPath(String(plan.params.domain));
    const live = (r.pf.occupants ?? []).some((o) => o.file === mine || o.target === mine);
    if (!live && !r.pf.registry?.vhost_file) return ok("主機已自行還原：這個站的網站設定沒有上線");
    return no("這個站的網站設定仍在主機上，系統不會自動移除；請工程師確認");
  },
};
