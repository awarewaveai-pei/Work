// /tools/content/topics -- one site's topics (AUTO_CONTENT P9.3); its sub-pages clients/ and steps/ hold the all-sites
// table and the site's five steps (R8).
import { StaffTopicsPage } from "./TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "自動內容 · 題目" };

export default function TopicsPage() {
  return <StaffTopicsPage view="topics" />;
}
