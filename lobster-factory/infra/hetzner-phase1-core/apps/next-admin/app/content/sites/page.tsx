import SiteManager from "../../(shell)/tools/content/sites/SiteManager";

export const metadata = { title: "我的網站" };

// content.<base domain>/sites: the customer's own WordPress sites. Adding a site or changing its URL stays staff-only
// (siteUrlWriteGate, lib/content/wp-sites.ts), so SiteManager hides those controls on a door.
export default function ContentDoorSitesPage() {
  return <SiteManager />;
}
