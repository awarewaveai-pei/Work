// Reddit allows our IP one request per ~6 s: its fetches must be spaced and a failed one retried once (2026-11-15: 6 of 7
// geos got 429). Apify social sources: nothing runs without a hold, the vendor charge is capped at the hold, and the
// logged cost is what the returned items imply.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchRemoteFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collect/net/remote-file", () => ({ fetchRemoteFile }));
const holdCost = vi.hoisted(() => vi.fn());
const logToolCost = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/ai/log-ai-call", () => ({ holdCost, logToolCost, logAiCall: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: vi.fn(async () => ({ allowed: true })) }));

const { APIFY_TRENDS, runApifyTrend, spacedByHost } = await import("../trending-sources");
const { byKind } = await import("../blocks/registry");

const feed = (title: string) => ({ bytes: new TextEncoder().encode(`<feed><entry><title>${title}</title></entry></feed>`), contentType: "application/atom+xml" });

describe("Reddit spacing", () => {
  beforeEach(() => { vi.useFakeTimers(); fetchRemoteFile.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("a second call to the same host starts only after the gap", async () => {
    const started: number[] = [];
    const a = spacedByHost("h.example", 7000, async () => { started.push(Date.now()); });
    const b = spacedByHost("h.example", 7000, async () => { started.push(Date.now()); });
    await vi.advanceTimersByTimeAsync(7000);
    await Promise.all([a, b]);
    expect(started).toHaveLength(2);
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(7000);
  });

  it("a failed Reddit fetch is tried once more after the gap", async () => {
    fetchRemoteFile.mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce(feed("Reddit headline"));
    const reddit = byKind("search").find((b) => b.id === "search/reddit")!;
    const run = reddit.run({ geo: "US" }) as Promise<Array<{ title: string }>>;
    await vi.advanceTimersByTimeAsync(7000);
    expect(await run).toEqual([expect.objectContaining({ title: "Reddit headline" })]);
    expect(fetchRemoteFile).toHaveBeenCalledTimes(2);
  });
});

describe("Apify social trends", () => {
  const dcard = APIFY_TRENDS.find((d) => d.id === "dcard")!;
  beforeEach(() => { process.env.APIFY_API_TOKEN = "t"; holdCost.mockReset(); logToolCost.mockClear(); });

  it("does not call the vendor when the hold is refused", async () => {
    holdCost.mockResolvedValue(null);
    const f = vi.fn();
    expect(await runApifyTrend(dcard, "TW", f as unknown as typeof fetch)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("caps the charge at the hold and logs the cost of the items returned", async () => {
    holdCost.mockResolvedValue({ id: "h" });
    const rows = [{ title: "猶豫不決要不要分手", likeCount: 443, forumName: "感情" }, { title: "成人版貼文", nsfw: true }];
    const f = vi.fn(async () => new Response(JSON.stringify(rows), { status: 201 }));
    const items = await runApifyTrend(dcard, "TW", f as unknown as typeof fetch);
    const ceiling = Number((dcard.price.start + dcard.price.item * dcard.maxItems).toFixed(4));
    expect(holdCost).toHaveBeenCalledWith(expect.anything(), ceiling);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain(`maxTotalChargeUsd=${ceiling}`);
    expect(items).toEqual([expect.objectContaining({ title: "猶豫不決要不要分手", traffic: "443讚", category: "感情", source: "Dcard" })]);
    expect(logToolCost).toHaveBeenCalledWith(expect.objectContaining({ costUsd: dcard.price.start + dcard.price.item * 2, delivered: true }));
  });

  it("a call we gave up on is recorded at the ceiling, not as free", async () => {
    holdCost.mockResolvedValue({ id: "h" });
    const f = vi.fn(async () => { throw new Error("timeout"); });
    expect(await runApifyTrend(dcard, "TW", f as unknown as typeof fetch)).toEqual([]);
    const ceiling = Number((dcard.price.start + dcard.price.item * dcard.maxItems).toFixed(4));
    expect(logToolCost).toHaveBeenCalledWith(expect.objectContaining({ costUsd: ceiling, delivered: false }));
  });

  it("a call refused before running costs nothing", async () => {
    holdCost.mockResolvedValue({ id: "h" });
    const f = vi.fn(async () => new Response("bad input", { status: 400 }));
    expect(await runApifyTrend(dcard, "TW", f as unknown as typeof fetch)).toEqual([]);
    expect(logToolCost).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0, delivered: false }));
  });
});
