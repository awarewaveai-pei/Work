import OutreachStatsPage from "./ToolsOutreachPageClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "外聯總覽" };

export default function Page() {
  return (
    <>
      <h1 style={SR_ONLY}>外聯總覽</h1>
      <OutreachStatsPage />
    </>
  );
}
