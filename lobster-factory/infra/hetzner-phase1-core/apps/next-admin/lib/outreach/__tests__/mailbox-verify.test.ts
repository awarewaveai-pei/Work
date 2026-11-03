// Card C8.6: the paid verdict shapes and the 90-day cache rule (what send-adapter.ts acts on is in send-adapter.test.ts).
import { describe, expect, it, vi } from "vitest";
import { freshPaid, inferenceKey, mapHunter, mapReoon, mapZeroBounce, verifyMailbox, verifyWithFallback, VerifyPending } from "../mailbox-verify";

const NOW = new Date("2026-11-02T03:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("mailbox verify", () => {
  it("maps Hunter and ZeroBounce to valid / invalid / risky / unknown", () => {
    expect(["valid", "invalid", "disposable", "accept_all", "unknown"].map((status) => mapHunter({ data: { status } })))
      .toEqual(["valid", "invalid", "invalid", "risky", "unknown"]);
    expect(mapHunter({ data: { status: "webmail", result: "deliverable" } })).toBe("valid");
    expect(mapHunter({ data: { status: "webmail", result: "risky" } })).toBe("risky");
    expect(["valid", "invalid", "catch-all", "unknown", "spamtrap", "do_not_mail"].map((status) => mapZeroBounce({ status })))
      .toEqual(["valid", "invalid", "risky", "unknown", "invalid", "invalid"]);
  });

  it("only a paid verdict from the last 90 days counts; MX-only never does", () => {
    expect(freshPaid({ status: "valid", provider: "hunter", verified_at: daysAgo(89) }, NOW)).not.toBeNull();
    expect(freshPaid({ status: "valid", provider: "hunter", verified_at: daysAgo(91) }, NOW)).toBeNull();
    expect(freshPaid({ status: "unknown", provider: "mx_syntax", verified_at: daysAgo(1) }, NOW)).toBeNull();
  });

  it("a Hunter check still running (202) is not an answer; the key never appears in an error", async () => {
    const f = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(verifyMailbox("a@b.example", { provider: "hunter", apiKey: "k" }, f(202, {}))).rejects.toBeInstanceOf(VerifyPending);
    await expect(verifyMailbox("a@b.example", { provider: "hunter", apiKey: "SECRET" }, f(401, { errors: "bad key SECRET" }))).rejects.toThrow(/401(?!.*SECRET)/);
    expect(await verifyMailbox("a@b.example", { provider: "zerobounce", apiKey: "k" }, f(200, { status: "catch-all" }))).toBe("risky");
  });
});

describe("two free quotas (D25)", () => {
  const keys = [{ provider: "hunter" as const, apiKey: "h" }, { provider: "zerobounce" as const, apiKey: "z" }];
  it("a key out of quota hands over to the next; a running check stops; no key = null; all failing = the error", async () => {
    const asked: string[] = [];
    const v = await verifyWithFallback("a@b.example", keys, async (_e, k) => { asked.push(k.provider); if (k.provider === "hunter") throw new Error("hunter verify 429"); return "valid"; });
    expect(v).toEqual({ status: "valid", provider: "zerobounce" });
    expect(asked).toEqual(["hunter", "zerobounce"]);
    await expect(verifyWithFallback("a@b.example", keys, async () => { throw new VerifyPending("hunter"); })).rejects.toBeInstanceOf(VerifyPending);
    expect(await verifyWithFallback("a@b.example", [])).toBeNull();
    await expect(verifyWithFallback("a@b.example", keys, async (_e, k) => { throw new Error(`${k.provider} down`); })).rejects.toThrow("zerobounce down");
  });

  it("with a deadline, no fallback call starts that could end after it", async () => {
    let clock = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      const asked: string[] = [];
      // the first call uses its whole 20 s before failing
      const fail = async (_e: string, k: { provider: string }) => { asked.push(k.provider); clock += 20_000; throw new Error(`${k.provider} 429`); };
      await expect(verifyWithFallback("a@b.example", keys, fail, clock + 25_000)).rejects.toThrow("hunter 429");
      expect(asked).toEqual(["hunter"]);  // 5 s left: the 20 s ZeroBounce call does not start
      expect(await verifyWithFallback("a@b.example", keys, fail, clock + 10_000)).toBeNull();  // nothing fits at all
      // a slow first key that does not fit is skipped, a faster one behind it still runs
      const slow = [{ provider: "reoon" as const, apiKey: "r" }, { provider: "zerobounce" as const, apiKey: "z" }];
      expect(await verifyWithFallback("a@b.example", slow, async (_e, k) => (k.provider === "zerobounce" ? "valid" : "unknown"), clock + 80_000))
        .toEqual({ status: "valid", provider: "zerobounce" });
    } finally { spy.mockRestore(); }
  });
});

describe("Reoon (D25 free daily quota)", () => {
  it("power mode only; safe and role accounts are valid, catch-all risky, an error answer throws", async () => {
    expect(["safe", "role_account", "invalid", "disabled", "catch_all", "inbox_full", "unknown"].map((status) => mapReoon({ status })))
      .toEqual(["valid", "valid", "invalid", "invalid", "risky", "risky", "unknown"]);
    let url = "";
    const ok = (async (u: string) => { url = u; return new Response(JSON.stringify({ status: "safe" }), { status: 200 }); }) as unknown as typeof fetch;
    expect(await verifyMailbox("a@b.example", { provider: "reoon", apiKey: "k" }, ok)).toBe("valid");
    expect(url).toContain("mode=power");
    const out = (async () => new Response(JSON.stringify({ status: "error", reason: "no credits" }), { status: 200 })) as unknown as typeof fetch;
    await expect(verifyMailbox("a@b.example", { provider: "reoon", apiKey: "k" }, out)).rejects.toThrow("no credits");
  });
});

describe("inference key (C13 finder)", () => {
  it("Hunter when present, whatever the send order; else the first", () => {
    const r = { provider: "reoon" as const, apiKey: "r" }, h = { provider: "hunter" as const, apiKey: "h" };
    expect(inferenceKey([r, h])).toBe(h);
    expect(inferenceKey([r])).toBe(r);
    expect(inferenceKey([])).toBeNull();
  });
});
