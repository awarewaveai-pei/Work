// /tools/content/topics/steps -- one site's five steps, with step ④'s schedule switch for a person who holds that tool (R8).
import { StaffTopicsPage } from "../TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "自動內容 · 五步驟" };

export default function TopicsStepsPage() {
  return <StaffTopicsPage view="steps" />;
}
