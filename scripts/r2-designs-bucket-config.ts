/**
 * R2 bucket `lobster-designs`: CORS (browser presigned PUT) + lifecycle (uploads/pending/ deleted after 1 day).
 * PLAN-designs-direct-upload.md C2. Run locally: `npx tsx scripts/r2-designs-bucket-config.ts [--dry-run|--apply]`.
 *
 * ★ 主機 env 改了要重跑（STAFF_HOSTS／PRODUCT_HOST_*／PUBLIC_BASE_DOMAIN 決定 CORS origin 清單；新增產品或換網域後
 *   CORS 不會自己更新，瀏覽器直傳會被 R2 擋）。
 *
 * Env in:  R2_API_TOKEN, R2_ACCOUNT_ID (required); R2_DESIGNS_BUCKET (default lobster-designs);
 *          STAFF_HOSTS, PRODUCT_HOST_<KEY>, PUBLIC_BASE_DOMAIN = the prod container's values:
 *          docker exec lobster-next-admin printenv | grep -E '^(STAFF_HOSTS|PRODUCT_HOST_|PUBLIC_BASE_DOMAIN|R2_DESIGNS_BUCKET)='
 *          (printenv does not expand PRODUCT_HOST_*; unset = the code defaults of lib/portal/hosts.ts / lobster-designs,
 *          and the script says so in its output). A container that sets R2_DESIGNS_BUCKET to another bucket MUST pass it.
 * Flags:   --dry-run (default; read only) | --apply (HIGH: backs current config up to agency-os/reports/r2/, PUTs, reads back)
 *          --dev-origin <http(s)://host[:port]>  extra origin, only when given (never added silently)
 *          --bucket <name>
 * Cloudflare REST (account-scoped Bearer R2_API_TOKEN; schema checked against the OpenAPI spec 2026-11-15):
 *   GET|PUT /accounts/<id>/r2/buckets/<bucket>/cors       https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/
 *   GET|PUT /accounts/<id>/r2/buckets/<bucket>/lifecycle  https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/lifecycle/
 * PUT replaces the whole list, so rules are merged by `id`: ours is replaced, every other existing rule is kept.
 * Never prints a token value or the account id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { productHost, staffHosts } from "../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/hosts";
import { PRODUCTS } from "../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products";

export const DEFAULT_BUCKET = "lobster-designs";
export const CORS_RULE_ID = "awarewave-designs-direct-upload";
export const LIFECYCLE_RULE_ID = "awarewave-designs-pending-1d";
export const PENDING_PREFIX = "uploads/pending/";
export const CORS_MAX_AGE_SECONDS = 600;
export const PENDING_MAX_AGE_SECONDS = 86400;

type Env = Record<string, string | undefined>;
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Rule = { [k: string]: Json };

/** `scheme://host[:port]` only — what R2 CORS compares against the Origin header. */
export function normalizeOrigin(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error(`origin 不是合法網址：${raw}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`origin 只能 http(s)：${raw}`);
  if (u.pathname !== "/" || u.search || u.hash || u.username) throw new Error(`origin 不得含路徑／查詢／帳密：${raw}`);
  return u.origin;
}

/** https:// + staff hosts + every enabled next-admin door's product host; dev origin only when passed explicitly. */
export function buildOrigins(env: Env, devOrigin?: string): string[] {
  const hosts = new Set<string>(staffHosts(env));
  for (const p of PRODUCTS) {
    if (p.door.app === "next-admin" && p.door.enabled !== false) hosts.add(productHost(p, env));
  }
  const origins = new Set<string>([...hosts].map((h) => normalizeOrigin(`https://${h}`)));
  if (devOrigin) origins.add(normalizeOrigin(devOrigin));
  return [...origins].sort();
}

export const desiredCorsRule = (origins: string[]): Rule => ({
  id: CORS_RULE_ID,
  allowed: { origins, methods: ["PUT"], headers: ["content-type"] },
  maxAgeSeconds: CORS_MAX_AGE_SECONDS,
});

export const desiredLifecycleRule = (): Rule => ({
  id: LIFECYCLE_RULE_ID,
  enabled: true,
  conditions: { prefix: PENDING_PREFIX },
  deleteObjectsTransition: { condition: { type: "Age", maxAge: PENDING_MAX_AGE_SECONDS } },
});

/** Replace our rule (by id), keep every other existing rule, ours goes last. */
export function mergeRules(existing: Rule[], ours: Rule): Rule[] {
  return [...existing.filter((r) => r.id !== ours.id), ours];
}

/** Foreign rules that were in `before` but are no longer in `after` (a concurrent edit or a bad PUT). */
export function lostRules(before: Rule[], after: Rule[], oursId: string): Rule[] {
  return before.filter((r) => r.id !== oursId && !after.some((a) => isSubset(r, a)));
}

/** Every key/value of `want` is present in `have` (R2 may add defaulted fields on read-back). Arrays compare in order. */
export function isSubset(want: Json | undefined, have: Json | undefined): boolean {
  if (want === undefined) return true;
  if (Array.isArray(want)) {
    return Array.isArray(have) && want.length === have.length && want.every((w, i) => isSubset(w, have[i]));
  }
  if (want !== null && typeof want === "object") {
    if (have === null || typeof have !== "object" || Array.isArray(have)) return false;
    return Object.entries(want).every(([k, v]) => isSubset(v, (have as { [k: string]: Json })[k]));
  }
  return want === have;
}

export type RuleDiff = { id: string; status: "add" | "change" | "same" | "keep"; before?: Rule; after?: Rule };

/** Per-rule difference between what the bucket has and what we would PUT. */
export function diffRules(current: Rule[], merged: Rule[], ours: Rule): RuleDiff[] {
  const out: RuleDiff[] = [];
  for (const m of merged) {
    const id = String(m.id ?? "");
    const before = current.find((c) => c.id === m.id);
    if (m.id !== ours.id) out.push({ id, status: "keep", before, after: m });
    else if (!before) out.push({ id, status: "add", after: m });
    else out.push({ id, status: isSubset(ours, before) ? "same" : "change", before, after: m });
  }
  return out;
}

export const changed = (d: RuleDiff[]) => d.some((x) => x.status === "add" || x.status === "change");

// ── Cloudflare REST ─────────────────────────────────────────────────────────────────────────────────────────────
export class CfError extends Error {
  constructor(public status: number, public codes: number[], message: string) {
    super(message);
  }
}

type Cfg = { token: string; account: string; bucket: string };
const cfBase = (c: Cfg, what: "cors" | "lifecycle") =>
  `https://api.cloudflare.com/client/v4/accounts/${c.account}/r2/buckets/${encodeURIComponent(c.bucket)}/${what}`;

async function cf(c: Cfg, what: "cors" | "lifecycle", method: "GET" | "PUT", body?: Json): Promise<Json> {
  const res = await fetch(cfBase(c, what), {
    method,
    headers: { Authorization: `Bearer ${c.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let parsed: { success?: boolean; errors?: { code: number; message: string }[]; result?: Json } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body: reported by status below */
  }
  if (!res.ok || parsed.success === false) {
    const errs = parsed.errors ?? [];
    throw new CfError(res.status, errs.map((e) => e.code), `${method} ${what}: HTTP ${res.status} ${errs.map((e) => `${e.code} ${e.message}`).join("; ")}`.trim());
  }
  return parsed.result ?? null;
}

/** GET → rules[]; a bucket with no config answers 404 (NoSuchCORSConfiguration / NoSuchLifecycleConfiguration) = []. */
export async function readRules(c: Cfg, what: "cors" | "lifecycle"): Promise<Rule[]> {
  try {
    const r = (await cf(c, what, "GET")) as { rules?: Rule[] } | null;
    return r?.rules ?? [];
  } catch (e) {
    if (e instanceof CfError && e.status === 404) return [];
    throw e;
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function parseArgs(argv: string[]) {
  const a = { apply: false, dryRun: false, devOrigin: undefined as string | undefined, bucket: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--apply") a.apply = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--dev-origin" || k === "--bucket") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${k} 需要一個值`);
      if (k === "--dev-origin") a.devOrigin = v;
      else a.bucket = v;
    } else throw new Error(`未知參數：${k}`);
  }
  if (a.apply && a.dryRun) throw new Error("--apply 與 --dry-run 不能同時給");
  return a;
}

const j = (v: Json) => JSON.stringify(v, null, 2);
const utcStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function printSection(title: string, diffs: RuleDiff[], currentCount: number) {
  console.log(`\n== ${title}（現有 ${currentCount} 條規則）==`);
  for (const d of diffs) {
    const tag = { add: "新增", change: "變更", same: "已一致（不動）", keep: "保留（非本腳本管理）" }[d.status];
    console.log(`- [${tag}] ${d.id}`);
    if (d.status === "change") console.log(`  現行：${JSON.stringify(d.before)}\n  套用：${JSON.stringify(d.after)}`);
    if (d.status === "add") console.log(`  套用：${JSON.stringify(d.after)}`);
  }
}

export async function main(argv: string[], env: Env = process.env): Promise<number> {
  const args = parseArgs(argv);
  const have = (k: string) => Boolean(env[k]?.trim());
  console.log(`認證：R2_API_TOKEN ${have("R2_API_TOKEN") ? "有" : "缺"}、R2_ACCOUNT_ID ${have("R2_ACCOUNT_ID") ? "有" : "缺"}`);
  const hostEnvNames = ["STAFF_HOSTS", "PUBLIC_BASE_DOMAIN", ...Object.keys(env).filter((k) => k.startsWith("PRODUCT_HOST_"))];
  console.log(`主機 env：${hostEnvNames.filter(have).join("、") || "（無）"}`);
  if (!have("STAFF_HOSTS") && !have("PUBLIC_BASE_DOMAIN")) {
    console.log("⚠ STAFF_HOSTS／PUBLIC_BASE_DOMAIN 都沒給 → 用程式預設值算 origin；正式機若有覆寫，這份清單會漏。先 docker exec lobster-next-admin printenv 取值再重跑。");
  }
  if (!have("R2_DESIGNS_BUCKET") && !args.bucket) {
    console.log(`⚠ R2_DESIGNS_BUCKET 沒給 → 用預設 ${DEFAULT_BUCKET}；正式機若指向別的 bucket，會設錯地方（docker exec 取值後重跑）。`);
  }
  if (!have("R2_API_TOKEN") || !have("R2_ACCOUNT_ID")) {
    console.error("缺 R2_API_TOKEN／R2_ACCOUNT_ID，停止。");
    return 2;
  }
  const cfg: Cfg = {
    token: env.R2_API_TOKEN!.trim(),
    account: env.R2_ACCOUNT_ID!.trim(),
    bucket: args.bucket ?? (env.R2_DESIGNS_BUCKET?.trim() || DEFAULT_BUCKET),
  };

  const origins = buildOrigins(env, args.devOrigin);
  console.log(`模式：${args.apply ? "--apply（寫入）" : "--dry-run（只讀）"}　bucket：${cfg.bucket}`);
  console.log(`CORS origins（${origins.length}）：\n${origins.map((o) => `  ${o}`).join("\n")}`);

  const cors = desiredCorsRule(origins);
  const life = desiredLifecycleRule();
  let curCors: Rule[];
  let curLife: Rule[];
  try {
    [curCors, curLife] = [await readRules(cfg, "cors"), await readRules(cfg, "lifecycle")];
  } catch (e) {
    if (e instanceof CfError && (e.status === 401 || e.status === 403)) {
      console.error(`\n讀取被拒（${e.message}）。現有 R2_API_TOKEN 沒有 bucket 設定權限：需操作者臨時給 bucket 設定權限的 token，本腳本不會自己換其他憑證。`);
      return 3;
    }
    throw e;
  }
  const mergedCors = mergeRules(curCors, cors);
  const mergedLife = mergeRules(curLife, life);
  const dCors = diffRules(curCors, mergedCors, cors);
  const dLife = diffRules(curLife, mergedLife, life);
  printSection("CORS", dCors, curCors.length);
  printSection("Lifecycle", dLife, curLife.length);
  const any = changed(dCors) || changed(dLife);
  console.log(`\n結論：${any ? "有差異，--apply 會套用上面標「新增／變更」的規則" : "bucket 已與期望一致，無需變更"}`);
  if (!args.apply) return 0;
  if (!any) return 0;

  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../agency-os/reports/r2");
  fs.mkdirSync(dir, { recursive: true });
  const backup = path.join(dir, `${cfg.bucket}-${utcStamp()}.json`);
  // LF on purpose: agency-os/reports writers must not produce CRLF (see Write-RepoTextFile).
  fs.writeFileSync(backup, `${j({ bucket: cfg.bucket, savedAtUtc: new Date().toISOString(), cors: { rules: curCors }, lifecycle: { rules: curLife } })}\n`, { encoding: "utf8" });
  console.log(`現行設定已備份：${path.relative(process.cwd(), backup)}`);

  if (changed(dCors)) await cf(cfg, "cors", "PUT", { rules: mergedCors });
  if (changed(dLife)) await cf(cfg, "lifecycle", "PUT", { rules: mergedLife });

  const [afterCors, afterLife] = [await readRules(cfg, "cors"), await readRules(cfg, "lifecycle")];
  const okCors = afterCors.some((r) => isSubset(cors, r));
  const okLife = afterLife.some((r) => isSubset(life, r));
  const lost = [...lostRules(curCors, afterCors, cors.id as string), ...lostRules(curLife, afterLife, life.id as string)];
  console.log(`讀回比對：CORS ${okCors ? "一致" : "不一致"}、lifecycle ${okLife ? "一致" : "不一致"}、其他規則遺失 ${lost.length} 條`);
  if (!okCors || !okLife || lost.length) {
    console.error(`讀回與期望不符；以 ${path.relative(process.cwd(), backup)} 還原。`);
    return 4;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    },
  );
}
