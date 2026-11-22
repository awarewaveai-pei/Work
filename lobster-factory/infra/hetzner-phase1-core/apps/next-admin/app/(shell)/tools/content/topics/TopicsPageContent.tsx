// The staff control page's server half (AUTO_CONTENT P9.3): loads every number once and hands it to the board. The content
// door reads the same overview through GET /api/content/topics/overview (a door page never reads with the service role).
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { canAccessOrg, effectiveOrgId, OrgAccessError } from "@/lib/tenant-guard";
import { staffGrantOf, staffMayUseTool, staffUnrestricted } from "@/lib/staff-access";
import { StaffTopicsBoard } from "./StaffTopicsBoard";
import type { TopicsView } from "./TopicsBoard";

// R8: 題目 and its sub-page 五步驟 in the side menu, each one view of the same board; the client rail picks the site (K8).
const HEAD: Record<TopicsView, [string, string]> = {
  topics: ["自動內容・題目", "一個網站一個月的題目。題目核准後才會開始製作。"],
  steps: ["自動內容・五步驟", "一個網站的五個步驟：搜集熱搜 → 提案題目 → 挑題 → 製作 → 發布。"],
};

/** The page's ?org= (Next 15 searchParams): the current client, as the client rail keeps it in the address (ADR 020). */
export type TopicsSearch = Promise<Record<string, string | string[] | undefined>>;
export async function orgParam(searchParams: TopicsSearch): Promise<string | null> {
  const v = (await searchParams).org;
  return typeof v === "string" ? v : null;
}

/** The staff page of one view: its heading and the board. */
export function StaffTopicsPage({ view, org }: { view: TopicsView; org: string | null }) {
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>{HEAD[view][0]}</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 24px" }}>{HEAD[view][1]}</p>
      <TopicsPageContent view={view} org={org} />
    </div>
  );
}

export async function TopicsPageContent({ view, org }: { view: TopicsView; org: string | null }) {
  const sb = getSupabaseWriteClient();
  if (!sb) return <p style={{ color: "var(--text-muted)" }}>Supabase 未設定，無法讀取。</p>;
  const h = await headers();
  // step ④ (the steps page only) embeds the 排程 tool's table (/api/ops/schedules): shown only to a person who holds that
  // tool (staff-tools.test.ts NEEDS_OTHER_TOOL)
  const grant = staffGrantOf(h);
  const canSchedule = view === "steps" && (staffUnrestricted(grant) || staffMayUseTool(grant!, "ops/schedules"));
  const req = new Request("http://localhost", { headers: h });
  // only the picked client is read (ADR 020); a client account always gets its own, a malformed ?org= reads nothing
  let current: string | null;
  try { current = effectiveOrgId(req, org); }
  catch (e) { if (e instanceof OrgAccessError) current = null; else throw e; }
  return <StaffTopicsBoard overview={await loadOverview(sb, current, (o) => canAccessOrg(req, o))} canSchedule={canSchedule} view={view} />;
}
