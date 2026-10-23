import { verify } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { featureList, resetFeatureListCache } from "../features";
import { canonicalize } from "../permit";
import { CUSTOMER, gateFixture } from "./gate-fixtures";

const KEYS = ["social.dispatch", "content.title"];

beforeEach(() => resetFeatureListCache());

describe("the usable-features list that greys paid buttons (ADR 017 §4)", () => {
  it("enforce greys what is not bought, with the reason; nothing is audited", async () => {
    const { deps, audit } = gateFixture({ balance: 0 });
    const { list } = await featureList(CUSTOMER, "client:x:u", deps, KEYS);
    expect(list.features["social.dispatch"]).toEqual({ allowed: true, verdict: true, reason: null });
    expect(list.features["content.title"]).toEqual({ allowed: false, verdict: false, reason: "no_credits" });
    expect(audit).not.toHaveBeenCalled();
  });

  it("shadow greys nothing but still carries the real verdict", async () => {
    const { list } = await featureList(CUSTOMER, "client:x:u", gateFixture({ mode: "shadow", entitlement: null }).deps, KEYS);
    expect(list.features["social.dispatch"]).toEqual({ allowed: true, verdict: false, reason: "no_entitlement" });
  });

  it("is signed with the permit key and kept for five minutes", async () => {
    const { deps, findActiveEntitlement } = gateFixture({ balance: 5 });
    const now = 1_000_000;
    const first = await featureList(CUSTOMER, "a", deps, KEYS, now);
    expect(verify(null, Buffer.from(canonicalize(first.list)), deps.publicKeys().k1, Buffer.from(first.signature!, "base64url"))).toBe(true);
    expect(first.list.expires_at - first.list.issued_at).toBe(300);
    const lookups = findActiveEntitlement.mock.calls.length;
    expect(await featureList(CUSTOMER, "a", deps, KEYS, now + 299)).toBe(first);
    expect(findActiveEntitlement).toHaveBeenCalledTimes(lookups);   // a cached list reads nothing
    expect(await featureList(CUSTOMER, "a", deps, KEYS, now + 300)).not.toBe(first);
  });
});
