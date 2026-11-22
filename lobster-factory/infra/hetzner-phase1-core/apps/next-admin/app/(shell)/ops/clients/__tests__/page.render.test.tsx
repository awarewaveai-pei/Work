// K10: the /ops/clients landing page lists the clients with a content problem; empty and failed reads say so.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// a plain function, not a vi.fn: vitest reports a vi.fn that throws as a test error even when the caller catches it
let answer: () => Promise<unknown> = async () => ({ clients: [], more: false });
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/tenant-guard", () => ({ canAccessOrg: () => true }));
vi.mock("@/lib/content/topics/overview-load", () => ({ loadClientProblems: () => answer() }));
import ClientsPage from "../page";

const draw = async () => renderToStaticMarkup(await ClientsPage());
beforeEach(() => { answer = async () => ({ clients: [], more: false }); });

describe("/ops/clients landing", () => {
  it("a client with a problem is a link to its content tab, and 'more' says to use the search", async () => {
    answer = async () => ({ clients: [{ organizationId: "o1", slug: "acme", name: "艾克米", lastError: "boom", failedTopics: 2 }], more: true });
    const html = await draw();
    expect(html).toContain("艾克米");
    expect(html).toContain("/ops/clients/acme?tab=%E5%85%A7%E5%AE%B9%E5%B7%A5%E5%85%B7");
    expect(html).toContain("排程出錯：boom");
    expect(html).toContain("2 個題目失敗");
    expect(html).toContain("還有更多，請用左側搜尋");
  });
  it("no problem: says so, and the note still says the list covers two kinds of problem only", async () => {
    const html = await draw();
    expect(html).toContain("沒有排程出錯或題目失敗的客戶");
    expect(html).toContain("不代表一切正常");
  });
  it("a failed read is shown as a failure, not as 'no problem'", async () => {
    answer = async () => { throw new Error("content_overview:problem_topics:down"); };
    const html = await draw();
    expect(html).toContain("讀取失敗");
    expect(html).not.toContain("沒有排程出錯");
  });
});
