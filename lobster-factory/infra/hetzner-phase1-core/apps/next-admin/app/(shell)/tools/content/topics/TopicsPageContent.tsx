// The staff control page's server half (AUTO_CONTENT P9.3): loads every number once and hands it to the board. The content
// door reads the same overview through GET /api/content/topics/overview (a door page never reads with the service role).
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { canAccessOrg } from "@/lib/tenant-guard";
import { staffGrantOf, staffMayUseTool, staffUnrestricted } from "@/lib/staff-access";
import { StaffTopicsBoard } from "./StaffTopicsBoard";
import type { TopicsView } from "./TopicsBoard";

// R8: 題目 and its two sub-pages in the side menu (客戶, 五步驟), each one view of the same board.
const HEAD: Record<TopicsView, [string, string]> = {
  topics: ["自動內容・題目", "一個網站一個月的題目。題目核准後才會開始製作。"],
  clients: ["自動內容・客戶", "挑一個客戶看它每個網站的數字；有問題的客戶排在前面、名稱前是紅點。"],
  steps: ["自動內容・五步驟", "一個網站的五個步驟：搜集熱搜 → 提案題目 → 挑題 → 製作 → 發布。"],
};

/** The staff page of one view: its heading and the board. */
export function StaffTopicsPage({ view }: { view: TopicsView }) {
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>{HEAD[view][0]}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 24px" }}>{HEAD[view][1]}</p>
      <TopicsPageContent view={view} />
    </div>
  );
}

export async function TopicsPageContent({ view }: { view: TopicsView }) {
  const sb = getSupabaseWriteClient();
  if (!sb) return <p style={{ color: "var(--text-muted)" }}>Supabase 未設定，無法讀取。</p>;
  const h = await headers();
  // step ④ (the steps page only) embeds the 排程 tool's table (/api/ops/schedules): shown only to a person who holds that
  // tool (staff-tools.test.ts NEEDS_OTHER_TOOL)
  const grant = staffGrantOf(h);
  const canSchedule = view === "steps" && (staffUnrestricted(grant) || staffMayUseTool(grant!, "ops/schedules"));
  const req = new Request("http://localhost", { headers: h });
  return <StaffTopicsBoard overview={await loadOverview(sb, (org) => canAccessOrg(req, org))} canSchedule={canSchedule} view={view} />;
}
