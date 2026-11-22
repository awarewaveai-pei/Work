// K10: the client page's content tab draws one editable block per site and links to the writing page with org + site.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientHubTabs, type ClientHubTabsProps } from "../[slug]/ClientHubTabs";

const site = (id: string, name: string) => ({ id, name, url: `https://${id}.example.com`, color: null, active: true, content_defaults: {} });
describe("client page content tab", () => {
  it("every site gets its own block and links with org and site", () => {
    const props = {
      org: { id: "org-1", slug: "c", name: "C", type: "client", status: "active" }, cfg: {}, health: null, wp: null, runs: [], installRuns: [],
      deptSummary: {}, integrations: [], wpSites: [site("site-a", "站甲"), site("site-b", "站乙")], researchBridgesEnabled: false,
      billing: {}, initialTab: "內容工具",
    } as unknown as ClientHubTabsProps;
    const html = renderToStaticMarkup(<ClientHubTabs {...props} />);
    expect(html).toContain("品牌聲音（Brand Voice）· 站甲");
    expect(html).toContain("品牌聲音（Brand Voice）· 站乙");
    expect(html).toContain("/tools/content?org=org-1&amp;site=site-b");
    expect(html).not.toContain("siteId=");
  });
});
