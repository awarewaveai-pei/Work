// /tools/content/topics -- one site's topics (AUTO_CONTENT P9.3); its sub-page steps/ holds the site's five steps (R8).
import { StaffTopicsPage, orgParam, type TopicsSearch } from "./TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "自動內容 · 題目" };

export default async function TopicsPage({ searchParams }: { searchParams: TopicsSearch }) {
  return <StaffTopicsPage view="topics" org={await orgParam(searchParams)} />;
}
