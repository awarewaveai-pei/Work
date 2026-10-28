// The staff control page's server half (AUTO_CONTENT P9.3): loads every number once and hands it to the board. The content
// door reads the same overview through GET /api/content/topics/overview (a door page never reads with the service role).
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { canAccessOrg } from "@/lib/tenant-guard";
import { staffGrantOf, staffMayUseTool, staffUnrestricted } from "@/lib/staff-access";
import { StaffTopicsBoard } from "./StaffTopicsBoard";

export async function TopicsPageContent() {
  const sb = getSupabaseWriteClient();
  if (!sb) return <p style={{ color: "var(--text-muted)" }}>Supabase 未設定，無法讀取。</p>;
  const h = await headers();
  // step ④ embeds the 排程 tool's table (/api/ops/schedules): shown only to a person who holds that tool (staff-tools.test.ts NEEDS_OTHER_TOOL)
  const grant = staffGrantOf(h);
  const canSchedule = staffUnrestricted(grant) || staffMayUseTool(grant!, "ops/schedules");
  const req = new Request("http://localhost", { headers: h });
  return <StaffTopicsBoard overview={await loadOverview(sb, (org) => canAccessOrg(req, org))} canSchedule={canSchedule} />;
}
