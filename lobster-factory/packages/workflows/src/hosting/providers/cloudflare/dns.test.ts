import { describe, it, expect } from "vitest";
import { upsertDnsARecord, deleteDnsARecord, type CloudflareDnsConfig } from "./dns";

const CFG: CloudflareDnsConfig = {
  apiToken: "cf-test-token-SECRET",
  zoneId: "f21b1919632fee2221647908a94fdcac",
};

type Call = { url: string; method: string; body?: any; auth?: string };

/** Build a mock fetch that records calls and replies from a scripted list table. */
function mockFetch(existingRecord: { id: string } | null) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    const method = init?.method ?? "GET";
    calls.push({
      url: String(url),
      method,
      body: init?.body ? JSON.parse(init.body) : undefined,
      auth: init?.headers?.Authorization,
    });
    const json = (obj: any, ok = true) =>
      ({ ok, status: ok ? 200 : 400, statusText: "", text: async () => JSON.stringify(obj) }) as any;

    if (method === "GET") {
      return json({ success: true, result: existingRecord ? [existingRecord] : [] });
    }
    if (method === "POST") return json({ success: true, result: { id: "new-rec-id" } });
    if (method === "PUT") return json({ success: true, result: { id: existingRecord!.id } });
    if (method === "DELETE") return json({ success: true, result: { id: existingRecord!.id } });
    return json({ success: false, errors: [{ message: "unexpected" }] }, false);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("upsertDnsARecord", () => {
  it("creates (POST) when no record exists", async () => {
    const { fetchImpl, calls } = mockFetch(null);
    const r = await upsertDnsARecord(CFG, { name: "acme.aware-wave.com", ipv4: "1.2.3.4" }, fetchImpl);
    expect(r.created).toBe(true);
    expect(r.recordId).toBe("new-rec-id");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls[1].body).toMatchObject({ type: "A", name: "acme.aware-wave.com", content: "1.2.3.4", proxied: true, ttl: 1 });
  });

  it("updates (PUT) when a record already exists — idempotent re-run", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "existing-id" });
    const r = await upsertDnsARecord(CFG, { name: "acme.aware-wave.com", ipv4: "5.6.7.8" }, fetchImpl);
    expect(r.created).toBe(false);
    expect(r.recordId).toBe("existing-id");
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(calls[1].url).toContain("/dns_records/existing-id");
  });

  it("sends the token only in the Authorization header (never in URL/body)", async () => {
    const { fetchImpl, calls } = mockFetch(null);
    await upsertDnsARecord(CFG, { name: "x.aware-wave.com", ipv4: "1.1.1.1" }, fetchImpl);
    for (const c of calls) {
      expect(c.url).not.toContain("SECRET");
      expect(JSON.stringify(c.body ?? {})).not.toContain("SECRET");
      expect(c.auth).toBe("Bearer cf-test-token-SECRET");
    }
  });

  it("throws on a Cloudflare error envelope (success:false)", async () => {
    const fetchImpl = (async () =>
      ({ ok: true, status: 200, statusText: "", text: async () => JSON.stringify({ success: false, errors: [{ message: "bad zone" }] }) }) as any) as typeof fetch;
    await expect(
      upsertDnsARecord(CFG, { name: "x.aware-wave.com", ipv4: "1.1.1.1" }, fetchImpl)
    ).rejects.toThrow(/bad zone/);
  });
});

describe("deleteDnsARecord", () => {
  it("deletes when present", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "existing-id" });
    const r = await deleteDnsARecord(CFG, "acme.aware-wave.com", fetchImpl);
    expect(r.deleted).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });

  it("is a no-op when the record is absent (idempotent teardown)", async () => {
    const { fetchImpl, calls } = mockFetch(null);
    const r = await deleteDnsARecord(CFG, "ghost.aware-wave.com", fetchImpl);
    expect(r.deleted).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });
});
