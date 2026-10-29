// A feed URL can be a customer's (a site's own feeds, P9.4): every RSS fetch must go through collect's gated fetcher
// (address gate on every redirect hop), never a plain fetch that follows a redirect to an internal host.
import { afterAll, describe, expect, it, vi } from "vitest";

const fetchRemoteFile = vi.hoisted(() => vi.fn(async () => ({
  bytes: new TextEncoder().encode("<rss><channel><item><title>Shop news headline</title></item></channel></rss>"), contentType: "application/rss+xml",
})));
vi.mock("@/lib/collect/net/remote-file", () => ({ fetchRemoteFile }));

const plainFetch = vi.fn(async () => { throw new Error("plain fetch used"); });
const originalFetch = global.fetch;
global.fetch = plainFetch as unknown as typeof fetch;
afterAll(() => { global.fetch = originalFetch; });

const { buildDbSearchBlocks } = await import("../trending-sources");

describe("RSS feed fetch", () => {
  it("goes through the gated fetcher, not a plain fetch", async () => {
    const [block] = buildDbSearchBlocks([{ id: "s", label: "shop", url: "https://shop.example/feed", geos: "*", enabled: true }]);
    const items = await block.run({ geo: "TW" });
    expect(fetchRemoteFile).toHaveBeenCalledWith("https://shop.example/feed", expect.objectContaining({ keepPrefix: true }));
    expect(plainFetch).not.toHaveBeenCalled();
    expect(items).toEqual([expect.objectContaining({ title: "Shop news headline" })]);
  });
});
