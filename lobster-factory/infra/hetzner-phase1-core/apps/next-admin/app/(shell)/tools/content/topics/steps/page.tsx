// /tools/content/topics/steps -- one site's five steps, with step ④'s schedule switch for a person who holds that tool (R8).
import { StaffTopicsPage, orgParam, type TopicsSearch } from "../TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "五步驟" };

export default async function TopicsStepsPage({ searchParams }: { searchParams: TopicsSearch }) {
  return <StaffTopicsPage view="steps" org={await orgParam(searchParams)} heading={<h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>五步驟</h1>} />;
}
