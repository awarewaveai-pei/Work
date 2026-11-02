// Card C13.2: Hunter's fake answers (deliverable / risky / undeliverable) through inferEmail -- only a paid `valid` is an
// address; MX comes first; no key = MX only, unverified; the finder is the second path.
import { describe, expect, it } from "vitest";
import { findMailbox, inferEmail, verifyMailbox, type InferDeps, type VerifierKey } from "../mailbox-verify";
import type { EmailStatus } from "../verify-email";

const KEY: VerifierKey = { provider: "hunter", apiKey: "hunter-test" };
const NOW = new Date("2026-11-02T03:00:00Z");
const ANN = { name: "Ann Lee", domain: "acme.com" };
const hunter = (answers: Record<string, unknown>, urls: string[] = []) => (async (u: string | URL) => {
  const url = String(u);
  urls.push(url);
  const who = new URL(url).searchParams.get("email") ?? "finder";
  return new Response(JSON.stringify(answers[who] ?? { data: { status: "unknown" } }), { status: 200 });
}) as unknown as typeof fetch;
const DELIVERABLE = { data: { status: "valid", result: "deliverable" } };
const RISKY = { data: { status: "accept_all", result: "risky" } };
const UNDELIVERABLE = { data: { status: "invalid", result: "undeliverable" } };

function deps(answers: Record<string, unknown>, extra: Partial<InferDeps> = {}) {
  const saved: Array<[string, EmailStatus]> = [];
  const urls: string[] = [];
  const paid: string[] = [];
  const d: InferDeps = {
    now: () => NOW,
    mx: async (emails) => new Map(emails.map((e) => [e, "unknown" as EmailStatus])),
    stored: async () => null,
    save: async (email, status) => { saved.push([email, status]); },
    verify: (email, key) => verifyMailbox(email, key, hunter(answers, urls)),
    find: (domain, first, last, key) => findMailbox(domain, first, last, key, hunter(answers, urls)),
    onPaid: async (p) => { paid.push(p); },
    ...extra,
  };
  return { d, saved, urls, paid };
}

describe("inferEmail with Hunter answers", () => {
  it("the first deliverable guess wins; undeliverable and risky ones before it are stored, not returned", async () => {
    const { d, saved, paid } = deps({ "ann.lee@acme.com": UNDELIVERABLE, "ann@acme.com": RISKY, "a.lee@acme.com": DELIVERABLE });
    const r = await inferEmail(null as never, null, ANN, KEY, d);
    expect(r).toMatchObject({ email: "a.lee@acme.com", outcome: "valid", provider: "hunter", via: "guess", paidCalls: 3 });
    expect(saved).toEqual([["ann.lee@acme.com", "invalid"], ["ann@acme.com", "risky"], ["a.lee@acme.com", "valid"]]);
    expect(paid).toHaveLength(3);
  });

  it("risky and undeliverable everywhere = no address (finder asked last, also not valid)", async () => {
    const { d, saved } = deps({ "ann.lee@acme.com": RISKY, "ann@acme.com": UNDELIVERABLE, "a.lee@acme.com": RISKY, "annlee@acme.com": UNDELIVERABLE,
      finder: { data: { email: "ann.l@acme.com", verification: { status: "accept_all" } } } });
    const r = await inferEmail(null as never, null, ANN, KEY, d);
    expect(r).toMatchObject({ email: null, outcome: "none", paidCalls: 5 });
    expect(saved.map(([, s]) => s)).not.toContain("valid");
    expect(r.candidates.at(-1)).toMatchObject({ email: "ann.l@acme.com", paid: "risky" });
  });

  it("the finder is the second path: its valid address is stored and returned", async () => {
    const { d, saved } = deps({ finder: { data: { email: "Ann.Lee.PhD@acme.com", verification: { status: "valid" } } } });
    const r = await inferEmail(null as never, null, ANN, KEY, d);
    expect(r).toMatchObject({ email: "ann.lee.phd@acme.com", outcome: "valid", via: "finder", paidCalls: 5 });
    expect(saved.at(-1)).toEqual(["ann.lee.phd@acme.com", "valid"]);
  });

  it("a domain with no mail server is dropped before anything is paid; no key = MX only, unverified", async () => {
    const dead = deps({}, { mx: async (emails) => new Map(emails.map((e) => [e, "invalid" as EmailStatus])) });
    expect(await inferEmail(null as never, null, ANN, KEY, dead.d)).toMatchObject({ email: null, outcome: "none", paidCalls: 0 });
    expect(dead.urls).toEqual([]);
    const free = deps({});
    const r = await inferEmail(null as never, null, ANN, null, free.d);
    expect(r).toMatchObject({ email: null, outcome: "unverified", paidCalls: 0 });
    expect(r.candidates).toHaveLength(4);
    expect(free.urls).toEqual([]);
  });

  it("a fresh paid verdict is not paid for twice; a check still running (202) stops the run as pending", async () => {
    const fresh = deps({}, { stored: async (e) => (e === "ann.lee@acme.com" ? { status: "valid", provider: "hunter", verified_at: NOW.toISOString() } : null) });
    expect(await inferEmail(null as never, null, ANN, KEY, fresh.d)).toMatchObject({ email: "ann.lee@acme.com", paidCalls: 0 });
    const running = deps({}, { verify: (email, key) => verifyMailbox(email, key, (async () => new Response("", { status: 202 })) as unknown as typeof fetch) });
    expect(await inferEmail(null as never, null, ANN, KEY, running.d)).toMatchObject({ email: null, outcome: "pending" });
  });
});
