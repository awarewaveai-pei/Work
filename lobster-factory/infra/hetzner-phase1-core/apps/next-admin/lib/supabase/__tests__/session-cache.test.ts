import { describe, it, expect } from "vitest";
import {
  getFreshCachedRole,
  consumeStaleCachedRole,
  cacheValidatedRole,
} from "@/lib/supabase/session-cache";

// All cache functions accept an injectable `now` so time-window behaviour is deterministic.
// Each test uses a unique key so the module-level Map does not leak state across cases.
let n = 0;
const uniqueKey = () => `sb-test-auth-token=tok-${n++}`;

describe("session-cache", () => {
  it("fresh hit within 15s, miss after", () => {
    const k = uniqueKey();
    const t0 = 1_000_000;
    cacheValidatedRole(k, "owner", t0);
    expect(getFreshCachedRole(k, t0 + 14_999)).toBe("owner");
    expect(getFreshCachedRole(k, t0 + 15_001)).toBeNull();
  });

  it("stale fallback within 120s, miss after", () => {
    const k = uniqueKey();
    const t0 = 2_000_000;
    cacheValidatedRole(k, "operator", t0);
    expect(consumeStaleCachedRole(k, t0 + 119_000)).toBe("operator");
    // fresh re-validate to refill the allowance before testing the horizon
    cacheValidatedRole(k, "operator", t0);
    expect(consumeStaleCachedRole(k, t0 + 120_001)).toBeNull();
  });

  it("caps consecutive stale uses then fails closed until re-validated", () => {
    const k = uniqueKey();
    const t0 = 3_000_000;
    cacheValidatedRole(k, "admin", t0);
    for (let i = 0; i < 8; i++) {
      expect(consumeStaleCachedRole(k, t0 + 1_000)).toBe("admin"); // 8 allowed
    }
    expect(consumeStaleCachedRole(k, t0 + 1_000)).toBeNull(); // 9th → fail closed
    // a successful network validation resets the allowance
    cacheValidatedRole(k, "admin", t0 + 2_000);
    expect(consumeStaleCachedRole(k, t0 + 2_500)).toBe("admin");
  });

  it("unknown key is always a miss (forged token never earns an entry)", () => {
    expect(getFreshCachedRole("sb-never-validated-auth-token=forged", 5_000_000)).toBeNull();
    expect(consumeStaleCachedRole("sb-never-validated-auth-token=forged", 5_000_000)).toBeNull();
  });

  it("re-validated hot key survives eviction under cache pressure", () => {
    const t0 = 6_000_000;
    const hot = uniqueKey();
    cacheValidatedRole(hot, "owner", t0);
    // Push well past MAX_ENTRIES (500) with distinct keys, re-touching the hot key throughout so
    // its delete-before-set re-insertion keeps it at the LRU tail.
    for (let i = 0; i < 700; i++) {
      cacheValidatedRole(`sb-pressure-${i}-auth-token=v`, "viewer", t0 + i);
      if (i % 50 === 0) cacheValidatedRole(hot, "owner", t0 + i); // keep hot
    }
    cacheValidatedRole(hot, "owner", t0 + 700);
    expect(getFreshCachedRole(hot, t0 + 700)).toBe("owner");
  });
});
