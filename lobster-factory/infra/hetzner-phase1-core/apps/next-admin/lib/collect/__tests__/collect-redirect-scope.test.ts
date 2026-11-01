// fetcher stayWithin: a redirect outside the given scope is refused before it is requested (lead research reads one
// business's site only; lib/collect/run.ts runLeadResearch passes its seed scope).
import { describe, expect, it } from "vitest";
import { createCollectFetch, CollectFetchError } from "@/lib/collect/net/fetcher";
import { createBudget } from "@/lib/collect/budget";
import { inScope } from "@/lib/collect/canonical";

const resolver = async () => ["93.184.216.34"];

describe("createCollectFetch stayWithin", () => {
  it("refuses a hop off the scope and never requests it", async () => {
    const asked: string[] = [];
    const transport = (async (url: string | URL) => {
      asked.push(String(url));
      return new Response(null, { status: 302, headers: { location: "https://other.example/page" } });
    }) as unknown as typeof fetch;
    const get = createCollectFetch({ budget: createBudget({ fetches: 5 }), robots: null, resolver, transport,
      stayWithin: (u) => inScope(u, { hosts: ["tree.example"] }) });
    await expect(get("https://tree.example/a")).rejects.toBeInstanceOf(CollectFetchError);
    expect(asked.some((u) => u.includes("other.example"))).toBe(false);
  });
});
