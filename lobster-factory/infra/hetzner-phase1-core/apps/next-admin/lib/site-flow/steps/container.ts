// Step 2 建立網站主機 (SITE-FLOW-COMPLETION-PLAN.md §1-3 "建容器"): `site-create <slug> <domain> <ingress>` queues a
// background host job; the engine polls `site-job` and then calls verify.
//
// Traps:
// - Names, port and paths are the host's (templates/client-wp/render.sh); the plan shows them as the host will derive
//   them, the port only as "the host picks a free one". Nothing here is sent except slug, domain and ingress.
// - ingress=product-gateway is accepted by the host only for slugs it lists (AW_SITE_GATEWAY_SLUGS): a refusal comes
//   back as 126 and is shown to the operator as such (shared.gateText).
// - Teardown is host-only (deprovision-site.sh, SITE-FLOW I5). rollback therefore only reports: compose-new already
//   undid a failed create on the host; a site that was built and then fails verify needs a human.

import type { SiteStepDefinition, StepContext, StepPlan } from "../types";
import { gateTargetOf } from "../gate-client";
import { gateText, HEALTHY, ingress, no, ok, readPreflight, unknown, type Preflight } from "./shared";

/** What makes the container step done: registered for this domain and ingress, both containers healthy. */
export function containerState(pf: Preflight, domain: string, mode: string): { status: "done" | "partial" | "absent" | "blocked"; detail: string } {
  if (pf.createPlan === "refuse") return { status: "blocked", detail: `主機不會建立這個站：${pf.createRefusal}` };
  if (pf.registry) {
    if (pf.registry.domain !== domain || pf.registry.ingress !== mode) {
      return { status: "blocked", detail: `主機登記的是 ${pf.registry.domain}（${pf.registry.ingress}），與這個環境（${domain}，${mode}）不符` };
    }
    if (pf.wpContainer === HEALTHY && pf.dbContainer === HEALTHY) {
      return { status: "done", detail: `主機已啟動（內部埠 127.0.0.1:${pf.registry.port ?? "?"}），已列入每日備份` };
    }
    return { status: "partial", detail: `已登記，但容器狀態是 網站=${pf.wpContainer}、資料庫=${pf.dbContainer}` };
  }
  if (pf.registryError) return { status: "partial", detail: `主機登記檔有問題：${pf.registryError}` };
  if (pf.createPlan === "retry") return { status: "partial", detail: "上次建立沒有完成（資料卷與設定保留，重跑會沿用）" };
  return { status: "absent", detail: "還沒建立" };
}

function target(ctx: Pick<StepContext, "environment">) {
  const t = gateTargetOf(ctx.environment);
  return { slug: t.slug ?? "", domain: t.domain ?? "", mode: ingress(ctx.environment) };
}

export const containerStep: SiteStepDefinition = {
  key: "create",
  title: "建立網站主機",
  requires: ["preflight"],
  timeoutMs: 30 * 60_000,
  async observe(ctx) {
    const { domain, mode } = target(ctx);
    if (!mode) return { status: "blocked", detail: "環境設定的 ingress 不是 host-vhost 或 product-gateway" };
    const r = await readPreflight(ctx);
    if ("detail" in r) return unknown(r.detail);
    return containerState(r.pf, domain, mode);
  },
  async plan(ctx): Promise<StepPlan> {
    const { slug, domain, mode } = target(ctx);
    if (!slug || !domain || !mode) throw new Error("環境缺少主機代號、網址或 ingress");
    const r = await readPreflight(ctx);
    const how = !r.ok ? "（無法讀取主機現況）" : r.pf.createPlan === "reused" ? "已建立：只確認現況" : r.pf.createPlan === "retry" ? "沿用上次沒完成的資料卷與設定重建" : "全新建立";
    return {
      summary: `在主機上建立 ${domain} 的網站容器與資料庫（${how}），並寫入主機登記檔（每日備份依它列入）`,
      items: [
        { label: "網站容器", value: `${slug}-wp` },
        { label: "資料庫容器", value: `${slug}-db` },
        { label: "資料卷", value: `${slug}_wordpress_data、${slug}_db_data` },
        { label: "主機檔案", value: `/root/sites/${slug}/docker-compose.yml、/root/sites/${slug}/.env（資料庫密碼在主機產生）` },
        { label: "主機登記檔", value: `/etc/awarewave/sites.d/${slug}.json` },
        { label: "內部埠", value: "主機在 8100–8199 挑一個沒用的，只綁 127.0.0.1" },
        { label: "網址", value: domain },
        { label: "網址接法", value: mode === "product-gateway" ? "產品閘道（容器加入 lobster-net；需主機允許）" : "主機 nginx 網站設定（第 5 步）" },
      ],
      rollback: "建立失敗時主機自動停止並移除容器與設定檔（資料卷與 .env 保留，重跑會沿用）；已建成的站只能在主機用 deprovision-site.sh 拆除",
      params: { slug, domain, ingress: mode },
    };
  },
  async precheck(ctx) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(r.detail);
    if (r.pf.createPlan === "refuse") return no(`主機不會建立這個站：${r.pf.createRefusal}`);
    return ok(`主機會${r.pf.createPlan === "reused" ? "確認既有的站" : "建立這個站"}`);
  },
  async execute(ctx) {
    const r = await ctx.gate.create();
    if ("detail" in r) return no(gateText(r));
    return { ok: true, detail: `主機已開始建立（工作 ${r.data.jobId}）`, jobId: r.data.jobId };
  },
  async verify(ctx, plan) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(r.detail);
    const s = containerState(r.pf, String(plan.params.domain), String(plan.params.ingress));
    return s.status === "done" ? ok(s.detail, { port: r.pf.registry?.port ?? null }) : no(s.detail);
  },
  async rollback(ctx) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return no(`無法確認主機現況：${r.detail}`);
    if (!r.pf.registry && r.pf.wpContainer === "absent" && r.pf.dbContainer === "absent") {
      return ok("主機已自行還原：沒有容器也沒有登記檔（資料卷與 .env 保留，重跑會沿用）");
    }
    return no("主機上還有這個站的容器或登記檔，系統不會自動拆除；確認原因後重跑，或由工程師在主機用 deprovision-site.sh 拆除");
  },
};
