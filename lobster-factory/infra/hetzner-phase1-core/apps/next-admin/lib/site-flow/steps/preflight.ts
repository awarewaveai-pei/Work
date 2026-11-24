// Step 1 網址檢查 (SITE-FLOW-COMPLETION-PLAN.md §1-3 first row, §2 step 3). Read-only: `site-preflight <slug> <domain>`.
//
// done = the host could be read and nothing stops step 2 (create). The URL's own findings (another vhost serves the
// domain, no covering certificate) are shown here but block only step 5 (vhost), as §1 #6 decides: the container and
// WordPress are built on the internal port regardless. DNS is not read here (no Cloudflare read in next-admin yet).

import type { SiteStepDefinition, StepPlan } from "../types";
import { ingress, ok, no, readPreflight, unknown, type Preflight } from "./shared";

export function urlFindings(pf: Preflight, mode: string | null): string[] {
  const lines: string[] = [];
  const ours = pf.registry?.vhost_file ?? null;
  const others = (pf.occupants ?? []).filter((o) => o.file !== ours && o.target !== ours);
  if (mode === "product-gateway") {
    lines.push(`網址由產品閘道分路（與既有服務共用網址）：第 5 步由工程師設定${others.length ? `；目前提供這個網址的設定檔：${others.map((o) => o.file).join("、")}` : ""}`);
  } else if (pf.occupants === null) {
    lines.push(`無法讀取主機的網站設定，不能確認網址沒被佔用（${pf.occupantsError || "nginx -T 失敗"}）`);
  } else if (others.length) {
    lines.push(`這個網址已經有別的站在用：${others.map((o) => o.file).join("、")}（第 5 步會被擋住）`);
  } else {
    lines.push("這個網址目前沒有別的站在用");
  }
  lines.push(pf.certs.length ? `安全憑證已涵蓋這個網址（${pf.certs[0].dir}，到期 ${pf.certs[0].not_after}）` : "主機上沒有涵蓋這個網址的有效安全憑證（第 5 步需要）");
  return lines;
}

export const preflightStep: SiteStepDefinition = {
  key: "preflight",
  title: "網址檢查",
  requires: [],
  timeoutMs: 10 * 60_000,
  async observe(ctx) {
    const r = await readPreflight(ctx);
    if ("detail" in r) return unknown(r.detail);
    const mode = ingress(ctx.environment);
    if (!mode) return { status: "blocked", detail: "環境設定的 ingress 不是 host-vhost 或 product-gateway" };
    const findings = urlFindings(r.pf, mode);
    // While the host is working on this site its plan is about half-done work: the address facts still stand.
    if (r.pf.createPlan === "refuse" && !r.pf.busy) {
      return { status: "blocked", detail: `主機不會建立這個站：${r.pf.createRefusal}`, facts: { findings } };
    }
    return { status: "done", detail: findings.join("；"), facts: { findings, create_plan: r.pf.createPlan } };
  },
  async precheck() {
    return ok("唯讀檢查，不需前置條件");
  },
  async plan(ctx): Promise<StepPlan> {
    return {
      summary: "重新讀一次主機上這個網址的現況（不改任何東西）",
      items: [{ label: "網址", value: new URL(ctx.environment.base_url ?? "https://invalid").hostname }],
      rollback: "唯讀，沒有要還原的",
      params: { read_only: true },
    };
  },
  async execute(ctx) {
    const r = await readPreflight(ctx);
    return "detail" in r ? no(r.detail) : ok(urlFindings(r.pf, ingress(ctx.environment)).join("；"));
  },
  async verify() {
    return ok("唯讀");
  },
  async rollback() {
    return ok("唯讀，沒有要還原的");
  },
};
