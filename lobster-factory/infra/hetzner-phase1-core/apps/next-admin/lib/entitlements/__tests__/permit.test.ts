import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { can, type CanDependencies, type EntitlementRecord } from "../can";
import { canonicalize, PermitError, signPermit, verifyPermit, type PermitBinding, type PermitPayload } from "../permit";

interface Vector {
  name: string; token: string; now: number; expected: PermitBinding; allowed: boolean;
  payload?: PermitPayload; canonical_utf8?: string;
}
const fixture = JSON.parse(readFileSync(path.resolve(__dirname,
  "../../../../../../../packages/contracts/fixtures/permit-v1/vectors.json"), "utf8")) as {
  test_only: boolean; keys: Record<string, { seed_hex: string; public_key_pem: string }>; vectors: Vector[];
};
const publicKeys = Object.fromEntries(Object.entries(fixture.keys).map(([kid, key]) => [kid, key.public_key_pem]));
// PKCS#8 Ed25519 private-key prefix; seeds are public RFC 8032 test data.
const privateKey = (kid = "test-old") => createPrivateKey({
  key: Buffer.from(`302e020100300506032b657004220420${fixture.keys[kid].seed_hex}`, "hex"), format: "der", type: "pkcs8",
});
const valid = fixture.vectors.find((v) => v.name === "valid-contract-jcs")!;
const binding = valid.expected;

describe("shared RFC 8785 / Ed25519 permit vectors", () => {
  it("uses only explicitly public test keys", () => expect(fixture.test_only).toBe(true));
  for (const vector of fixture.vectors) {
    it(vector.name, () => {
      if (vector.allowed) {
        // JCS normalizes negative zero to zero; compare the decoded canonical payload.
        expect(verifyPermit(vector.token, publicKeys, vector.expected, vector.now)).toEqual(JSON.parse(vector.canonical_utf8!));
        expect(canonicalize(vector.payload)).toBe(vector.canonical_utf8);
        // Ed25519 is deterministic: this proves the actual JS signer emits the Python-verified bytes.
        expect(signPermit(vector.payload!, privateKey(vector.payload!.kid))).toBe(vector.token);
      } else {
        expect(() => verifyPermit(vector.token, publicKeys, vector.expected, vector.now)).toThrow(PermitError);
      }
    });
  }
  it("old and new keys coexist only while the old verification key is configured", () => {
    expect(verifyPermit(valid.token, publicKeys, binding, valid.now).kid).toBe("test-old");
    expect(() => verifyPermit(valid.token, { "test-new": publicKeys["test-new"] }, binding, valid.now)).toThrow("unknown_kid");
  });
  it.each([NaN, Infinity, undefined, new Date(), String.fromCharCode(0xd800), String.fromCharCode(0xdc00)])(
    "rejects non-JSON or invalid Unicode values (%s)", (value) => expect(() => canonicalize({ value })).toThrow(PermitError),
  );
  it("serializes integer-looking object keys lexically and preserves array order", () => {
    expect(canonicalize({ "2": [2, 1], "10": 10 })).toBe('{"10":10,"2":[2,1]}');
  });
});

describe("can issues only registry-backed, bounded grants", () => {
  const row: EntitlementRecord = { id: "entitlement-test", organizationId: binding.tenant,
    productKey: binding.product_key, featureKey: binding.feature_key, source: "contract", sourceRef: "contract-test",
    startsAt: valid.now - 10, endsAt: valid.now + 70, status: "active", limits: { posts: 10 } };
  const dependencies = (changes: Partial<CanDependencies> = {}): CanDependencies => ({
    store: { findActiveEntitlement: vi.fn().mockResolvedValue(row), getCreditBalance: vi.fn().mockResolvedValue(20) },
    key: { kid: "test-old", privateKey: privateKey() }, now: () => valid.now,
    creditPolicy: vi.fn().mockResolvedValue({ minimumCharge: 2, singleLimit: 8 }), ...changes,
  });
  it("contract entitlement expires with the row and retains actor, limits and source", async () => {
    const deps = dependencies();
    const result = await can(binding, deps);
    expect(result.allowed).toBe(true);
    if (result.allowed === false) throw new Error(result.reason);
    expect(verifyPermit(result.permit, publicKeys, binding, valid.now)).toMatchObject({ source: "contract",
      entitlement_id: row.id, limits: row.limits, expires_at: row.endsAt, actor: binding.actor });
    expect(deps.store.getCreditBalance).not.toHaveBeenCalled();
  });
  it("unbounded comp entitlement gets a maximum 600 second permit", async () => {
    const deps = dependencies();
    vi.mocked(deps.store.findActiveEntitlement).mockResolvedValue({ ...row, source: "comp", endsAt: null });
    const result = await can(binding, deps);
    expect(result.allowed && result.payload).toMatchObject({ source: "comp", expires_at: valid.now + 600 });
  });
  it.each([null, { ...row, status: "suspended" }, { ...row, startsAt: valid.now + 1 },
    { ...row, endsAt: valid.now }, { ...row, organizationId: "other" }, { ...row, productKey: "other" },
    { ...row, featureKey: "other" }, { ...row, startsAt: NaN }])("rejects absent or invalid entitlement %#", async (entitlement) => {
    const deps = dependencies();
    vi.mocked(deps.store.findActiveEntitlement).mockResolvedValue(entitlement);
    expect(await can(binding, deps)).toEqual({ allowed: false, reason: "no_active_entitlement" });
  });
  const creditBinding = { ...binding, feature_key: "social.rewrite" };
  it.each([20, 5, 2])("credits cap is min(balance %s, single limit), without an entitlement", async (balance) => {
    const deps = dependencies();
    vi.mocked(deps.store.getCreditBalance).mockResolvedValue(balance);
    const result = await can(creditBinding, deps);
    expect(result.allowed).toBe(true);
    if (result.allowed === false) throw new Error(result.reason);
    expect(verifyPermit(result.permit, publicKeys, creditBinding, valid.now)).toMatchObject({
      source: "credits", entitlement_id: null, max_spend: Math.min(balance, 8), expires_at: valid.now + 600,
    });
    expect(deps.store.findActiveEntitlement).not.toHaveBeenCalled();
  });
  it.each([1.99, 0, -1, NaN, Infinity])("rejects insufficient or invalid balance %s", async (balance) => {
    const deps = dependencies();
    vi.mocked(deps.store.getCreditBalance).mockResolvedValue(balance);
    expect(await can(creditBinding, deps)).toEqual({ allowed: false, reason: "insufficient_credits" });
  });
  it.each([null, { minimumCharge: 0, singleLimit: 8 }, { minimumCharge: 2, singleLimit: 1 },
    { minimumCharge: 2, singleLimit: Infinity }])("rejects missing or invalid credit policy %#", async (policy) => {
    const deps = dependencies({ creditPolicy: vi.fn().mockResolvedValue(policy) });
    expect(await can(creditBinding, deps)).toEqual({ allowed: false, reason: "missing_credit_policy" });
  });
  it.each([{ ...binding, product_key: "unknown" }, { ...binding, feature_key: "unknown" },
    { ...binding, feature_key: "studio.image" }])("rejects unregistered product/feature binding %#", async (request) => {
    const deps = dependencies();
    expect(await can(request, deps)).toEqual({ allowed: false, reason: "unknown_feature" });
    expect(deps.store.findActiveEntitlement).not.toHaveBeenCalled();
    expect(deps.store.getCreditBalance).not.toHaveBeenCalled();
  });
  it.each([{ ...binding, actor: "" }, { ...binding, on_behalf_of: "other" }])("rejects invalid subject %#", async (request) => {
    expect(await can(request, dependencies())).toEqual({ allowed: false, reason: "invalid_subject" });
  });
});
