import { PRODUCTS } from "@/lib/portal/products";
import { signPermit, verifyPermit, type JsonValue, type PermitBinding, type PermitKey, type PermitPayload } from "./permit";
export { verifyPermit } from "./permit";

export interface EntitlementRecord {
  id: string;
  organizationId: string;
  productKey: string;
  featureKey: string;
  source: "contract" | "comp";
  sourceRef: string | null;
  startsAt: number;
  endsAt: number | null;
  status: string;
  limits: Record<string, JsonValue>;
}
export interface CanStore {
  findActiveEntitlement(input: { organizationId: string; productKey: string; featureKey: string; now: number }): Promise<EntitlementRecord | null>;
  getCreditBalance(organizationId: string): Promise<number>;
}
export interface CanDependencies {
  store: CanStore;
  key: { kid: string; privateKey: PermitKey };
  now?: () => number;
  creditPolicy?: (productKey: string, featureKey: string) => Promise<{ minimumCharge: number; singleLimit: number } | null>;
}
export type CanResult = { allowed: true; payload: PermitPayload; permit: string } | { allowed: false; reason: string };

/** Low-level signer (was `can` before ADR 017 step 3; callers use `can` below, which adds mode, subject and report). Store, policy and actor/tenant authorization are trusted server dependencies.
 * Callers resolve authenticated actor and billing tenant first; never expose this signer as a public HTTP endpoint.
 */
export async function issuePermit(request: PermitBinding, deps: CanDependencies): Promise<CanResult> {
  const deny = (reason: string): CanResult => ({ allowed: false, reason });
  const feature = PRODUCTS.find((p) => p.key === request.product_key)?.features.find((f) => f.feature_key === request.feature_key);
  if (!feature) return deny("unknown_feature");
  if (!request.tenant || !request.actor || request.on_behalf_of !== request.tenant) return deny("invalid_subject");
  const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
  let details: Pick<PermitPayload, "source" | "source_ref" | "entitlement_id" | "limits" | "max_spend">;
  let expiresAt = now + 600;
  // Who pays is per account x feature (ADR 017 §0): an active comp/contract row wins for every feature, credits
  // included, and never debits (report() debits only source=credits); the wallet answers only when no row does.
  const found = await deps.store.findActiveEntitlement({ organizationId: request.tenant, productKey: request.product_key, featureKey: request.feature_key, now });
  const row = found && found.status === "active" && found.organizationId === request.tenant && found.productKey === request.product_key && found.featureKey === request.feature_key
    && Number.isFinite(found.startsAt) && found.startsAt <= now && (found.endsAt === null || (Number.isFinite(found.endsAt) && Math.floor(found.endsAt) > now)) ? found : null;
  if (row) {
    // Do not let a cached permit extend an entitlement's own deadline.
    expiresAt = Math.min(expiresAt, row.endsAt === null ? expiresAt : Math.floor(row.endsAt));
    details = { source: row.source, source_ref: row.sourceRef, entitlement_id: row.id, limits: row.limits, max_spend: null };
  } else if (feature.billing === "credits") {
    const policy = await deps.creditPolicy?.(request.product_key, request.feature_key);
    if (!policy || !Number.isFinite(policy.minimumCharge) || policy.minimumCharge <= 0 || !Number.isFinite(policy.singleLimit) || policy.singleLimit < policy.minimumCharge) return deny("missing_credit_policy");
    const balance = await deps.store.getCreditBalance(request.tenant);
    if (!Number.isFinite(balance) || balance < policy.minimumCharge) return deny("insufficient_credits");
    details = { source: "credits", source_ref: null, entitlement_id: null, limits: {}, max_spend: Math.min(balance, policy.singleLimit) };
  } else {
    return deny("no_active_entitlement");
  }
  const payload: PermitPayload = { ...request, ...details, format_version: 1, issued_at: now, expires_at: expiresAt, kid: deps.key.kid };
  return { allowed: true, payload, permit: signPermit(payload, deps.key.privateKey) };
}

// ---- ADR 017 step 3: the one judgment every paid call asks ------------------------------------------------------

export type EntitlementMode = "shadow" | "enforce";
/** Only the exact string "enforce" enforces; unset or any typo stays shadow. Flipping it is High (ADR 017 §4). */
export function entitlementMode(env: Record<string, string | undefined> = process.env): EntitlementMode {
  return env.ENTITLEMENT_MODE === "enforce" ? "enforce" : "shadow";
}

/** Shadow mode covers AwareWave staff during rollout. A customer acting for itself (requestActor `client:<org>...`)
 *  always gets the real verdict, the debit and fail-closed errors: shadow would otherwise hand it unbought paid features. */
export function modeFor(d: Pick<GateDependencies, "mode">, actor: string): EntitlementMode {
  return actor.startsWith("client:") ? "enforce" : d.mode();
}

/** Billing account (root of the org tree). `unresolved` only appears on infrastructure-error grants. */
export interface Subject { orgId: string; kind: "internal" | "customer" | "unresolved" }
export interface Usage { units?: number; idempotencyKey?: string; meta?: Record<string, JsonValue> }
export interface GateEvent { event: string; subject: Subject; featureKey: string; actor: string; payload: Record<string, JsonValue> }

export interface GateDependencies {
  permit: () => Promise<CanDependencies>;
  publicKeys: () => Record<string, PermitKey>;
  mode: () => EntitlementMode;
  audit: (event: GateEvent) => Promise<void>;
  debit: (input: { orgId: string; units: number; idempotencyKey: string; featureKey: string }) => Promise<boolean>;
}

/** Staff tooling billed to the internal account; there is no product row to seed a comp entitlement on. */
export const BACK_OFFICE_FEATURES: ReadonlySet<string> = new Set(["ops.inbox-ai", "ops.onboarding-spec", "ops.command-plane", "ops.cheap-json", "ops.staging-image"]);

export class EntitlementRequired extends Error {
  readonly status = 403;
  constructor(readonly code: string) { super(`entitlement_required:${code}`); this.name = "EntitlementRequired"; }
}

const MINT = Symbol("grant");
const USED = new WeakSet<object>();
/** Only `can` mints one (the symbol is not exported), so a gateway parameter of this type cannot be faked in code. */
export class Grant {
  constructor(mint: typeof MINT, readonly info: {
    allowed: boolean; shadow: boolean; reason: string | null; featureKey: string; subject: Subject; actor: string;
    limits: Record<string, JsonValue>; maxSpend: number | null; source: PermitPayload["source"] | null; entitlementId: string | null;
  }, private readonly deps: GateDependencies) {
    if (mint !== MINT) throw new EntitlementRequired("forged_grant");
    // readonly/private vanish at runtime: freeze so `(grant as any).info.allowed = true` cannot pass assertGrant.
    // subject is copied: freezing the caller's object would freeze it for them too, and a shared one could be retargeted.
    (info as { subject: Subject }).subject = Object.freeze({ ...info.subject });
    Object.freeze(info.limits); Object.freeze(info); Object.freeze(this);
  }
  get allowed() { return this.info.allowed; }
  get shadow() { return this.info.shadow; }
  get reason() { return this.info.reason; }
  get featureKey() { return this.info.featureKey; }
  get subject() { return this.info.subject; }
  get actor() { return this.info.actor; }
  get limits() { return this.info.limits; }
  get maxSpend() { return this.info.maxSpend; }
  /** Usage metering (ADR 017 §4): every paid seam calls this when the grant reaches paid work; only the first call per
   *  grant records (one entitlement.usage row), so a request's libraries and a job's polls sharing a grant count once.
   *  Never debits and never rejects: units stay 0 until per-feature prices exist (operator decision). */
  recordUse(meta: Record<string, JsonValue> = {}): Promise<void> {
    if (USED.has(this)) return Promise.resolve();
    USED.add(this);
    return this.report({ meta });
  }
  /** Credits are debited from the billing account (on_behalf_of); the audit row always names the actor. A debit needs
   *  the caller's idempotencyKey: a retry with a fresh random key would charge twice. Only the debit may throw; once it
   *  succeeded an audit failure is logged, never thrown (the caller would retry a charge that already happened). */
  async report(usage: Usage = {}): Promise<void> {
    const units = usage.units ?? 0;
    try {
      // Shadow never debits, including an allowed verdict (ADR 017 §4): only enforce moves money.
      if (this.info.source === "credits" && modeFor(this.deps, this.actor) === "enforce" && units > 0) {
        if (this.info.maxSpend !== null && units > this.info.maxSpend) throw new EntitlementRequired("exceeds_max_spend");
        if (!usage.idempotencyKey) throw new EntitlementRequired("idempotency_key_required");
        const ok = await this.deps.debit({ orgId: this.subject.orgId, units, idempotencyKey: usage.idempotencyKey, featureKey: this.featureKey });
        if (!ok) throw new EntitlementRequired("no_credits");
      }
    } catch (e) {
      // Shadow never breaks the caller; enforce surfaces a failed debit.
      if (modeFor(this.deps, this.actor) === "enforce") throw e;
      console.warn(`[entitlement] report failed (shadow): ${String(e)}`);
    }
    await safeAudit(this.deps, { event: "entitlement.usage", subject: this.subject, featureKey: this.featureKey, actor: this.actor, payload: { units, source: this.info.source, shadow: this.shadow, ...(usage.meta ?? {}) } });
  }
}

const REASONS: Record<string, string> = { no_active_entitlement: "no_entitlement", insufficient_credits: "no_credits" };

type Verdict = { ok: true; limits: Record<string, JsonValue>; maxSpend: number | null; source: PermitPayload["source"]; entitlementId: string | null } | { ok: false; reason: string };

async function decide(subject: Subject, featureKey: string, actor: string, d: GateDependencies): Promise<Verdict> {
  if (BACK_OFFICE_FEATURES.has(featureKey)) {
    return subject.kind === "internal" ? { ok: true, limits: {}, maxSpend: null, source: "comp", entitlementId: null } : { ok: false, reason: "back_office_only" };
  }
  if (subject.kind === "unresolved") return { ok: false, reason: "invalid_subject" };
  const product = PRODUCTS.find((p) => p.features.some((f) => f.feature_key === featureKey));
  if (!product) return { ok: false, reason: "unknown_feature" };
  const binding: PermitBinding = { tenant: subject.orgId, product_key: product.key, feature_key: featureKey, actor, on_behalf_of: subject.orgId };
  const issued = await issuePermit(binding, await d.permit());
  if (issued.allowed === false) return { ok: false, reason: REASONS[issued.reason] ?? issued.reason };
  const payload = verifyPermit(issued.permit, d.publicKeys(), binding);
  return { ok: true, limits: payload.limits, maxSpend: payload.max_spend, source: payload.source, entitlementId: payload.entitlement_id };
}

/** The verdict alone: no audit row, no grant (the usable-features list asks it for many features at once). */
export async function verdictOf(subject: Subject, featureKey: string, actor: string, d: GateDependencies): Promise<{ allowed: boolean; reason: string | null }> {
  try {
    const v = await decide(subject, featureKey, actor, d);
    return v.ok === true ? { allowed: true, reason: null } : { allowed: false, reason: v.reason };
  } catch {
    return { allowed: false, reason: "infrastructure_error" };
  }
}

const safeAudit = async (d: GateDependencies, event: GateEvent) => {
  console.warn(`[entitlement] ${event.event} ${JSON.stringify({ feature_key: event.featureKey, subject: event.subject, actor: event.actor, ...event.payload })}`);
  try { await d.audit(event); } catch (e) { console.warn(`[entitlement] audit failed: ${String(e)}`); }
};

function mint(d: GateDependencies, subject: Subject, featureKey: string, actor: string, v: Verdict | { ok: "shadow"; reason: string }): Grant {
  const base = { featureKey, subject, actor, limits: {}, maxSpend: null, source: null, entitlementId: null };
  if (v.ok === true) return new Grant(MINT, { ...base, allowed: true, shadow: false, reason: null, limits: v.limits, maxSpend: v.maxSpend, source: v.source, entitlementId: v.entitlementId }, d);
  if (v.ok === "shadow") return new Grant(MINT, { ...base, allowed: true, shadow: true, reason: v.reason }, d);
  return new Grant(MINT, { ...base, allowed: false, shadow: false, reason: v.reason }, d);
}

/** A refusal decided before `can()` could run (e.g. naming an org without AuthorizedOrg): same shadow/enforce rule. */
export async function refuseBeforeVerdict(featureKey: string, actor: string, reason: string, d: GateDependencies, subject: Subject = { orgId: "unresolved", kind: "unresolved" }): Promise<Grant> {
  if (modeFor(d, actor) === "enforce") return mint(d, subject, featureKey, actor, { ok: false, reason });
  await safeAudit(d, { event: "entitlement.would_deny", subject, featureKey, actor, payload: { reason } });
  return mint(d, subject, featureKey, actor, { ok: "shadow", reason });
}

/** Infrastructure failure before a verdict existed (subject lookup, DB, keys): shadow logs and allows, enforce refuses. */
export async function gateFailure(featureKey: string, actor: string, error: unknown, d: GateDependencies, subject: Subject = { orgId: "unresolved", kind: "unresolved" }): Promise<Grant> {
  const reason = "infrastructure_error";
  if (modeFor(d, actor) === "enforce") return mint(d, subject, featureKey, actor, { ok: false, reason });
  await safeAudit(d, { event: "entitlement.infra_error", subject, featureKey, actor, payload: { reason, error: String(error).slice(0, 200) } });
  return mint(d, subject, featureKey, actor, { ok: "shadow", reason });
}

export async function can(subject: Subject, featureKey: string, actor: string, deps?: GateDependencies): Promise<Grant> {
  const d = deps ?? (await import("./runtime")).runtimeGateDependencies();
  let verdict: Verdict;
  try {
    verdict = await decide(subject, featureKey, actor, d);
  } catch (error) {
    return gateFailure(featureKey, actor, error, d, subject);
  }
  if (verdict.ok === true || modeFor(d, actor) === "enforce") return mint(d, subject, featureKey, actor, verdict);
  await safeAudit(d, { event: "entitlement.would_deny", subject, featureKey, actor, payload: { reason: verdict.reason } });
  return mint(d, subject, featureKey, actor, { ok: "shadow", reason: verdict.reason });
}
