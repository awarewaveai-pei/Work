import { createPublicKey, createPrivateKey, type KeyObject } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { recordOpsAudit } from "@/lib/ops-audit";
import { entitlementMode, type GateDependencies } from "./can";
import { creditPolicy, debitCredits, holdCredits, settleHoldCredits } from "./ledger";
import { createEntitlementStore } from "./tables";

// ENTITLEMENT_PUBLIC_KEYS = "kid:PEM;kid2:PEM" (";" separates, "\n" escapes allowed); signing kid = ENTITLEMENT_SIGNING_KID
// or the first listed kid. The ADR names the variables but not this layout (card gap).
const pem = (text: string, label: string) => {
  const body = text.replace(/\\n/g, "\n").trim();
  return body.includes("BEGIN") ? body : `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
};
function publicKeys(env = process.env): Record<string, KeyObject> {
  const raw = env.ENTITLEMENT_PUBLIC_KEYS;
  if (!raw) throw new Error("entitlement_public_keys_missing");
  const out: Record<string, KeyObject> = Object.create(null);
  for (const entry of raw.split(";").map((e) => e.trim()).filter(Boolean)) {
    const at = entry.indexOf(":");
    if (at <= 0) throw new Error("entitlement_public_keys_malformed");
    out[entry.slice(0, at)] = createPublicKey(pem(entry.slice(at + 1), "PUBLIC KEY"));
  }
  return out;
}
function signingKey(env = process.env) {
  const raw = env.ENTITLEMENT_SIGNING_KEY;
  if (!raw) throw new Error("entitlement_signing_key_missing");
  const kid = env.ENTITLEMENT_SIGNING_KID?.trim() || Object.keys(publicKeys(env))[0];
  if (!kid) throw new Error("entitlement_signing_kid_missing");
  return { kid, privateKey: createPrivateKey(pem(raw, "PRIVATE KEY")) };
}

const AUDIT_ROLES = new Set(["owner", "admin", "operator", "viewer"]);

export function runtimeGateDependencies(): GateDependencies {
  return {
    permit: async () => ({ store: createEntitlementStore(), key: signingKey(), creditPolicy }),
    publicKeys: () => publicKeys(),
    mode: () => entitlementMode(),
    async audit(e) {
      if (e.subject.kind === "unresolved") return;
      // ops_audit_events.actor_role is a closed set; the full actor string rides in the payload.
      const role = /^ops:(\w+)/.exec(e.actor)?.[1] ?? "viewer";
      await recordOpsAudit(e.subject.orgId, AUDIT_ROLES.has(role) ? role : "viewer", "entitlement", e.event,
        { feature_key: e.featureKey, actor: e.actor, on_behalf_of: e.subject.orgId, ...e.payload });
    },
    async debit(input) {
      const db = getSupabaseWriteClient();
      if (!db) throw new Error("entitlements_db_unavailable");
      return debitCredits(db, input);
    },
    async hold(input) {
      const db = getSupabaseWriteClient();
      if (!db) throw new Error("entitlements_db_unavailable");
      return holdCredits(db, input);
    },
    async settleHold(input) {
      const db = getSupabaseWriteClient();
      if (!db) throw new Error("entitlements_db_unavailable");
      return settleHoldCredits(db, input);
    },
  };
}
