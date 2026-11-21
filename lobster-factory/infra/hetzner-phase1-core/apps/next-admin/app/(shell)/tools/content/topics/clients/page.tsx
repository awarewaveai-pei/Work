// /tools/content/topics/clients -- every site at a glance; a row opens that site's topics (R8).
import { StaffTopicsPage } from "../TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "自動內容 · 客戶" };

export default function TopicsClientsPage() {
  return <StaffTopicsPage view="clients" />;
}
