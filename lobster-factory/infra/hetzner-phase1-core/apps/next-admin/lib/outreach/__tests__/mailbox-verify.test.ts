// Card C8.6: the paid verdict shapes and the 90-day cache rule (what send-adapter.ts acts on is in send-adapter.test.ts).
import { describe, expect, it } from "vitest";
import { freshPaid, mapHunter, mapZeroBounce, verifyMailbox, VerifyPending } from "../mailbox-verify";

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
