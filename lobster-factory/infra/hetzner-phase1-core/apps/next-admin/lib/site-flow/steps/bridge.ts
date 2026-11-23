// Step 7 接上 AI 控制通道 (wp-bridge; SITE-FLOW-COMPLETION-PLAN.md §1-3 "wp-bridge", §1-4, card SF-I items 2-4).
//
// execute: Ed25519 key pair made HERE; the private key goes to Supabase Vault first (client_credentials row +
// secret_put under clientCredSecretRef, the staging-admin-credential.ts shape), environments.metadata.bridge =
// {key_id, credential_id} and environments.credentials_ref next, and only then the PUBLIC key to the site through the
// gate (`site-wp put-bridge-pubkey <key_id> <public> write`). A key_id already registered with its private key still in
// the vault is reused, never regenerated.
// verify: the plugin's public GET /health (name, crypto_ready, version >= the catalog pin), then a request signed with
// the vaulted key (POST /drafts, read scope: /health is unsigned, so only a signed route proves the key), then the
// wp_sites ownership row (org = sites.organization_id, never from the caller) and bridgeSiteOrg reading it back.
//
// Invariants (card SF-I):
// - The private key exists only in this process and in the vault. It is never in a plan, a stage output, a detail, an
//   error text, a console line or a gate argument; vault/db errors are replaced by fixed sentences here.
// - Vault before site, so a failure can only leave "vault has the key, the site does not": not done (no verified run),
//   and a re-run converges by putting the same public key again. The gate cannot overwrite or revoke a site key; when
//   the site holds this key_id with another key or revoked, the vault copy is dropped and the re-run makes a new one.
// - One site, one organization: a wp_sites row for this install naming another (or no) organization fails the step;
//   existing rows are never changed.
// rollback (verify failed): nothing to undo -- vault and site hold the same key and a re-run reuses it. To retire a
// key: revoke it on the site (WordPress admin > AwareWave Bridge) and delete client_credentials <credential_id> with its
// vault entry in the database; the gate has no revoke sub-verb, and the client page's credential routes refuse this
// row (metadata.source = site-flow, managed-credential.ts).

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadContext, SiteStepDefinition, StepContext, StepPlan, StepResult } from "../types";
import { bridgeRegistrationOf, bridgeSiteOrg, probeRegisteredBridge, registeredBridgeClientId, wpSiteKey } from "@/lib/payments/woo";
import { clientCredSecretRef, deleteSecret, getSecret, putSecret } from "@/lib/secret-vault";
import { WP_PLUGIN_CATALOG } from "@/lib/wp-plugin-stack-catalog";
import { gateText, no, ok, patchEnvironmentMetadata, siteUrlOf } from "./shared";
import { SITE_FLOW_CREDENTIAL_SOURCE } from "../managed-credential";

type Json = Record<string, unknown>;
type Db = ReadContext["db"];
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export const BRIDGE_PLUGIN = "aware-wave-wp-bridge";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const FETCH_TIMEOUT_MS = 20_000;
/** observe runs on every status-page load, in parallel with the other steps: a dead site must not hold the page. */
const OBSERVE_TIMEOUT_MS = 5_000;

/** The pinned wp-bridge version the site flow installs (catalog releaseVersion). */
export const expectedBridgeVersion = (): string => WP_PLUGIN_CATALOG.find((p) => p.slug === BRIDGE_PLUGIN)?.releaseVersion ?? "";

/** a >= b for plain dotted numbers; anything else is not comparable (false). */
export function versionAtLeast(a: string, b: string): boolean {
  const re = /^[0-9]+(\.[0-9]+){0,3}$/;
  if (!re.test(a) || !re.test(b)) return false;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

// ── keys ─────────────────────────────────────────────────────────────────────

/** base64 public key (32 raw bytes) of a vaulted secret (32-byte seed or 64-byte libsodium); null when corrupt. */
function publicKeyOf(secretB64: string): string | null {
  try {
    const raw = Buffer.from(secretB64.trim(), "base64");
    if (raw.length !== 32 && raw.length !== 64) return null;
    const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw.subarray(0, 32)]), format: "der", type: "pkcs8" });
    const spki = createPublicKey(priv).export({ format: "der", type: "spki" }) as Buffer;
    return spki.subarray(spki.length - 32).toString("base64");
  } catch {
    return null;
  }
}

function newKeyPair(): { seedB64: string; publicB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { seedB64: pkcs8.subarray(pkcs8.length - 32).toString("base64"), publicB64: spki.subarray(spki.length - 32).toString("base64") };
}

/** The public half of the key registered for this environment: present, missing (re-make it), or unreadable (retry). */
async function vaultedPublicKey(db: Db, credentialId: string): Promise<{ state: "present"; publicB64: string } | { state: "missing" | "unreadable" }> {
  try {
    const { data, error } = await db.from("client_credentials").select("id,secret_ref").eq("id", credentialId).maybeSingle();
    if (error) return { state: "unreadable" };
    const ref = data ? (data as { secret_ref: string | null }).secret_ref : null;
    if (!ref) return { state: "missing" };
    const secret = await getSecret(ref);
    if (secret === null) return { state: "missing" };
    const pub = publicKeyOf(secret);
    return pub ? { state: "present", publicB64: pub } : { state: "missing" };
  } catch {
    return { state: "unreadable" };
  }
}

/** Removes a credential row and its vault entry (best effort); returns what could not be removed. */
async function dropCredential(db: Db, credentialId: string): Promise<string> {
  const left: string[] = [];
  try {
    await deleteSecret(clientCredSecretRef(credentialId));
  } catch {
    left.push(`保管庫 ${clientCredSecretRef(credentialId)}`);
  }
  try {
    const { error } = await db.from("client_credentials").delete().eq("id", credentialId);
    if (error) left.push(`client_credentials ${credentialId}`);
  } catch {
    left.push(`client_credentials ${credentialId}`);
  }
  return left.length ? `（殘留：${left.join("、")}）` : "";
}

/** New key pair -> vault -> environment record. The key never leaves this function except into putSecret. */
async function registerNewKey(ctx: StepContext, url: string): Promise<{ ok: true; keyId: string; credentialId: string; publicB64: string } | { ok: false; detail: string }> {
  const { db, site, environment } = ctx;
  const keyId = `aw-${environment.id.slice(0, 8)}-${randomBytes(4).toString("hex")}`;
  const credentialId = randomUUID();
  const host = new URL(url).hostname;
  const { error: insErr } = await db.from("client_credentials").insert({
    id: credentialId,
    client_id: site.organization_id,
    category: "cms",
    label: `WordPress AI 控制通道金鑰（${host}）`,
    identifier: keyId,
    note: url,
    metadata: { source: SITE_FLOW_CREDENTIAL_SOURCE, site_id: site.id, environment_id: environment.id, key_id: keyId },
  });
  if (insErr) return { ok: false, detail: "金鑰紀錄（client_credentials）寫入失敗，沒有產生任何東西" };
  const ref = clientCredSecretRef(credentialId);
  const pair = newKeyPair();
  try {
    await putSecret(ref, pair.seedB64);
    const { error } = await db.from("client_credentials").update({ secret_ref: ref, updated_at: new Date().toISOString() }).eq("id", credentialId);
    if (error) throw new Error("attach");
  } catch {
    return { ok: false, detail: `私鑰存入保管庫失敗，站上沒有寫入任何東西${await dropCredential(db, credentialId)}` };
  }
  const w = await patchEnvironmentMetadata(db, environment.id, { bridge: { key_id: keyId, credential_id: credentialId } }, { credentials_ref: credentialId });
  if ("detail" in w) return { ok: false, detail: `${w.detail}，站上沒有寫入任何東西${await dropCredential(db, credentialId)}` };
  return { ok: true, keyId, credentialId, publicB64: pair.publicB64 };
}

// ── ownership (wp_sites) ─────────────────────────────────────────────────────

/** exact = same scheme too (wpSiteKey), the spelling woo.ts bridgeSiteOrg reads; conflicts are judged without it. */
type OwnerRows = { ok: true; rows: Array<{ id: string; organization_id: string | null; active: boolean; exact: boolean }> } | { ok: false; detail: string };

/**
 * The install without its scheme: http://x and https://x are one site for ownership (woo.ts bridgeSiteOrg blocks on
 * such a pair rather than guess, so a new https row must not slip in beside an http row of another organization).
 */
const installOf = (url: string): string | null => wpSiteKey(url)?.replace(/^https?:\/\//, "") ?? null;

/** wp_sites rows for the same install as `url`, whatever their scheme. */
async function ownerRows(db: Db, url: string): Promise<OwnerRows> {
  const want = installOf(url);
  const { data, error } = await db.from("wp_sites").select("id,url,organization_id,active");
  if (error || !want) return { ok: false, detail: "讀不到 wp_sites" };
  const rows = ((data ?? []) as Array<{ id: string; url: string; organization_id: string | null; active: boolean }>).filter((r) => installOf(r.url) === want);
  const exact = wpSiteKey(url);
  return { ok: true, rows: rows.map((r) => ({ id: r.id, organization_id: r.organization_id ?? null, active: r.active === true, exact: wpSiteKey(r.url) === exact })) };
}

/** A refusal sentence when wp_sites already gives this install to someone else; null when it is free or ours. */
function ownerConflict(rows: Array<{ organization_id: string | null }>, org: string): string | null {
  const other = rows.find((r) => r.organization_id !== org);
  if (!other) return null;
  return other.organization_id
    ? "這個網址在 wp_sites 已登記給另一個客戶：不覆蓋，請先由工程師確認歸屬"
    : "這個網址在 wp_sites 已有一列但沒有歸屬客戶：不覆蓋，請先由工程師確認歸屬";
}

/** Writes the ownership row when none exists; never changes an existing row. */
async function ensureOwnerRow(ctx: StepContext, url: string): Promise<{ ok: true; created: string | null } | { ok: false; detail: string }> {
  const org = ctx.site.organization_id;
  const r = await ownerRows(ctx.db, url);
  if ("detail" in r) return { ok: false, detail: r.detail };
  const conflict = ownerConflict(r.rows, org);
  if (conflict) return { ok: false, detail: conflict };
  // Ours already, spelled exactly as this environment (bridgeSiteOrg matches the exact spelling). A same-organization
  // row under the other scheme is left as is and this spelling is added beside it.
  if (r.rows.some((x) => x.exact && x.active)) return { ok: true, created: null };
  if (r.rows.some((x) => x.exact)) return { ok: false, detail: "wp_sites 有這個網址但已停用：不自動啟用，請由工程師確認" };
  const id = randomUUID();
  const { error } = await ctx.db.from("wp_sites").insert({
    id,
    name: ctx.site.name,
    url,
    username: "",
    token: "",
    active: true,
    organization_id: org,
    note: `site-flow: environment ${ctx.environment.id}`,
  });
  if (error) return { ok: false, detail: (error as { code?: string }).code === "23505" ? "wp_sites 同時有人寫入這個網址：請重跑" : "wp_sites 寫入失敗" };
  return { ok: true, created: id };
}

// ── probes ───────────────────────────────────────────────────────────────────

/** reachable=false: no answer at all (network, timeout) -- "cannot tell", not "broken". */
export async function bridgeHealth(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; version: string } | { ok: false; detail: string; reachable: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url}/?rest_route=/aware-wave-bridge/v1/health`, { signal: ctrl.signal, headers: { "cache-control": "no-cache" } });
    const body = (await res.json().catch(() => null)) as Json | null;
    if (res.status !== 200 || !isObj(body)) return { ok: false, detail: `外掛健康檢查回 ${res.status}`, reachable: true };
    if (body.name !== BRIDGE_PLUGIN) return { ok: false, detail: "這個網址回應的不是 AwareWave WP Bridge", reachable: true };
    if (body.crypto_ready !== true) return { ok: false, detail: "站上的簽章功能（sodium）不能用", reachable: true };
    return { ok: true, version: typeof body.version === "string" ? body.version : "" };
  } catch {
    return { ok: false, detail: "從伺服器打不開外掛健康檢查", reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

// ── the step ─────────────────────────────────────────────────────────────────

async function freshEnvMetadata(db: Db, environmentId: string): Promise<Json | null> {
  const { data, error } = await db.from("environments").select("metadata").eq("id", environmentId).maybeSingle();
  return !error && data && isObj((data as Json).metadata) ? ((data as Json).metadata as Json) : null;
}

export const bridgeStep: SiteStepDefinition = {
  key: "bridge",
  title: "接上 AI 控制通道",
  requires: ["vhost"],
  // A staging subdirectory site is served under aware-wave.com already; it has no host steps 1-5 (docker only).
  requiresOn: (env) => (env.hosting_provider === "ks-aw-01-staging-subdir" ? [] : ["vhost"]),
  timeoutMs: 10 * 60_000,

  async observe(ctx) {
    const reg = bridgeRegistrationOf(ctx.environment.metadata);
    if (!reg) return { status: "absent", detail: "還沒建立通道金鑰" };
    const last = (await ctx.history("bridge"))[0] ?? null;
    const stages = last && Array.isArray(last.output.stages) ? (last.output.stages as Json[]) : [];
    const v = [...stages].reverse().find((s) => s.stage === "verify" && s.ok === true);
    if (last?.status !== "completed" || !v || !isObj(v.output) || v.output.key_id !== reg.keyId) {
      return { status: "partial", detail: `金鑰 ${reg.keyId} 已存入保管庫，通道還沒確認可用` };
    }
    const url = siteUrlOf(ctx.environment);
    const owner = url ? await bridgeSiteOrg(ctx.db as SupabaseClient, url) : undefined;
    if (owner !== ctx.site.organization_id) return { status: "partial", detail: "通道可用，但 wp_sites 沒有把這個站登記給這個客戶" };
    // Now, not only at the last run: the vault reference is still there (DB read; the vault itself is not opened
    // here) and the plugin still answers at the pinned version or later.
    const { data: cred, error: credErr } = await ctx.db.from("client_credentials").select("id,secret_ref").eq("id", reg.credentialId).maybeSingle();
    if (credErr) return { status: "unknown", detail: "讀不到金鑰紀錄" };
    if (!cred || !(cred as { secret_ref: string | null }).secret_ref) return { status: "partial", detail: `金鑰 ${reg.keyId} 的保管庫紀錄不見了：重跑會產生新金鑰` };
    const h = await bridgeHealth(url as string, OBSERVE_TIMEOUT_MS);
    if ("detail" in h) return h.reachable ? { status: "partial", detail: `通道上次確認可用，但現在${h.detail}` } : { status: "unknown", detail: `無法確認：${h.detail}` };
    if (!versionAtLeast(h.version, expectedBridgeVersion())) return { status: "partial", detail: `站上 AwareWave Bridge 是 ${h.version || "不明版本"}，低於 ${expectedBridgeVersion()}` };
    return { status: "done", detail: `通道金鑰 ${reg.keyId} 已確認可用（簽章請求 200；外掛 ${h.version}）`, facts: { key_id: reg.keyId } };
  },

  async plan(ctx): Promise<StepPlan> {
    const url = siteUrlOf(ctx.environment);
    if (!url) throw new Error("環境沒有網址");
    const reg = bridgeRegistrationOf(ctx.environment.metadata);
    const version = expectedBridgeVersion();
    return {
      summary: `建立後台與 ${url} 之間的簽章通道（AI 發文、商品、電子報都走它），並把這個站登記給這個客戶`,
      items: [
        { label: "網址", value: url },
        { label: "金鑰", value: reg ? `沿用 ${reg.keyId}（私鑰仍在保管庫時）` : "在後台產生新的 Ed25519 金鑰對" },
        { label: "私鑰", value: "只存保管庫（Supabase Vault），不顯示、不寫紀錄、不送主機" },
        { label: "公鑰", value: "經主機閘門寫入站上 AwareWave Bridge 的金鑰表（write 權限）" },
        { label: "確認方式", value: `外掛健康檢查（版本至少 ${version || "目錄釘選版"}）＋一個用這把私鑰簽章的請求回 200` },
        { label: "歸屬客戶", value: "這個站的客戶（wp_sites 一列；同網址已登記給別的客戶就停下，不覆蓋）" },
      ],
      rollback: "確認失敗時不刪金鑰：保管庫與站上是同一把，重跑沿用。要撤掉：WordPress 後台 AwareWave Bridge 撤銷該金鑰，並刪除保管庫那一列",
      params: { url, key_id: reg?.keyId ?? null, organization_id: ctx.site.organization_id, expected_version: version },
    };
  },

  async precheck(ctx) {
    const url = siteUrlOf(ctx.environment);
    if (!url) return no("環境沒有網址");
    if (!expectedBridgeVersion()) return no(`外掛目錄沒有 ${BRIDGE_PLUGIN} 的釘選版本`);
    const r = await ownerRows(ctx.db, url);
    if ("detail" in r) return no(r.detail);
    const conflict = ownerConflict(r.rows, ctx.site.organization_id);
    return conflict ? no(conflict) : ok("這個網址沒有登記給別的客戶");
  },

  async execute(ctx, plan) {
    const url = String(plan.params.url);
    const reg = bridgeRegistrationOf(ctx.environment.metadata);
    let keyId = "";
    let credentialId = "";
    let publicB64 = "";
    let keyState: "reused" | "created" = "created";
    if (reg) {
      const v = await vaultedPublicKey(ctx.db, reg.credentialId);
      if (v.state === "unreadable") return no("讀不到保管庫：沒有改任何東西，稍後重跑");
      if (v.state === "present") {
        keyId = reg.keyId;
        credentialId = reg.credentialId;
        publicB64 = v.publicB64;
        keyState = "reused";
      }
    }
    if (!keyId) {
      const n = await registerNewKey(ctx, url);
      if ("detail" in n) return no(n.detail);
      ({ keyId, credentialId, publicB64 } = n);
      // The replaced registration's private key is gone from the vault: its row is a dead reference.
      if (reg) await dropCredential(ctx.db, reg.credentialId);
    }
    const out = { key_id: keyId, credential_id: credentialId, key_state: keyState };
    const g = await ctx.gate.wp("put-bridge-pubkey", [keyId, publicB64, "write"]);
    if ("detail" in g) {
      if (/exists with another key or is revoked/.test(g.detail)) {
        // The site will never take this key_id again: forget it, so the re-run makes a new key.
        const cleared = await patchEnvironmentMetadata(ctx.db, ctx.environment.id, { bridge: null }, { credentials_ref: null });
        const left = cleared.ok ? await dropCredential(ctx.db, credentialId) : "（後台紀錄沒清掉）";
        return no(`站上的金鑰 ${keyId} 已被撤銷或是另一把：後台這把已作廢${left}，重跑會產生新金鑰`, out);
      }
      return no(`公鑰寫入站上失敗：${gateText(g)}。私鑰已在保管庫，重跑會沿用同一把`, out);
    }
    const siteKey = String(g.data.state ?? "");
    if (siteKey !== "created" && siteKey !== "reused") return no(`主機回報 ${siteKey || "沒有狀態"}`, out);
    return ok(`金鑰 ${keyId}：私鑰${keyState === "reused" ? "沿用保管庫" : "已存入保管庫"}，公鑰${siteKey === "created" ? "已寫入" : "原本就在"}站上`, { ...out, site_key: siteKey });
  },

  async verify(ctx, plan): Promise<StepResult> {
    const url = String(plan.params.url);
    const meta = await freshEnvMetadata(ctx.db, ctx.environment.id);
    const reg = bridgeRegistrationOf(meta);
    if (!reg) return no("環境紀錄沒有通道金鑰");
    const h = await bridgeHealth(url);
    if ("detail" in h) return no(h.detail, { key_id: reg.keyId });
    const want = String(plan.params.expected_version);
    if (!versionAtLeast(h.version, want)) return no(`站上 AwareWave Bridge 是 ${h.version || "不明版本"}，需要至少 ${want}`, { key_id: reg.keyId });
    const probe = await probeRegisteredBridge<Json>(registeredBridgeClientId(ctx.environment.id), "/drafts", {}, { db: ctx.db as SupabaseClient, getSecret });
    if ("error" in probe) return no(`用這把金鑰簽章的請求沒有通過（${probe.error}）`, { key_id: reg.keyId, bridge_version: h.version });
    const own = await ensureOwnerRow(ctx, url);
    if ("detail" in own) return no(own.detail, { key_id: reg.keyId, bridge_version: h.version });
    const owner = await bridgeSiteOrg(ctx.db as SupabaseClient, url);
    if (owner !== ctx.site.organization_id) {
      if (own.created) await ctx.db.from("wp_sites").delete().eq("id", own.created);
      return no("wp_sites 讀回的歸屬不是這個客戶（同主機有其他登記）：已撤回這次寫入的一列", { key_id: reg.keyId, bridge_version: h.version });
    }
    return ok(`通道可用：外掛 ${h.version}，簽章請求 200，歸屬已登記`, {
      key_id: reg.keyId,
      bridge_version: h.version,
      wp_sites: own.created ? "created" : "existing",
      organization_id: ctx.site.organization_id,
    });
  },

  async rollback() {
    return ok("不需還原：保管庫與站上是同一把金鑰，重跑沿用；要撤掉請在 WordPress 後台撤銷該金鑰並刪除保管庫那一列");
  },
};
