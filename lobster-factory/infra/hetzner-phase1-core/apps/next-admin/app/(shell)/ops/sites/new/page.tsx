// /ops/sites/new -- "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, cards SF-J / SF-J2). Staff only; the API refuses anyone but owner/admin.
// The first NAV_FIRST clients come from the server for the 既有客戶 picker; the picker searches the rest (OrgPicker.tsx).
// ?spec=&intake= (from 客戶問卷 /ops/onboarding, card SF-P) prefills the form from that spec (lib/site-flow/intake-prefill.ts).
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { NAV_FIRST, toPickOrg, type PickOrg } from "../../clients/nav-orgs";
import { NewSiteForm } from "./NewSiteForm";
import { intakePrefill } from "@/lib/site-flow/intake-prefill";

export const dynamic = "force-dynamic";
export const metadata = { title: "新增客戶網站" };

const ORG_COLS = "id,slug,name,color:metadata->>color";

/** The picker's first page; none (Supabase unset or unreadable) still leaves the search and the 新客戶 path working. */
async function loadClients(): Promise<{ clients: PickOrg[]; total: number }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { clients: [], total: 0 };
  const { data, error, count } = await sb.from("organizations").select(ORG_COLS, { count: "exact" }).neq("status", "inactive").order("created_at", { ascending: true }).limit(NAV_FIRST);
  if (error || !data) return { clients: [], total: 0 };
  const clients = data.map(toPickOrg);
  return { clients, total: count ?? clients.length };
}

export default async function NewSitePage({ searchParams }: { searchParams: Promise<{ spec?: string; intake?: string }> }) {
  const { spec, intake } = await searchParams;
  const sb = getSupabaseWriteClient();
  const [{ clients, total }, fromIntake] = await Promise.all([loadClients(), sb ? intakePrefill(sb, spec, intake).catch(() => null) : null]);
  const blockedQuote = fromIntake && "blockedQuote" in fromIntake ? fromIntake.blockedQuote : null;
  const prefill = fromIntake && !("blockedQuote" in fromIntake) ? fromIntake : null;
  let prefillClient: PickOrg | null = null;
  if (sb && prefill?.organizationId) {
    const { data } = await sb.from("organizations").select(ORG_COLS).eq("id", prefill.organizationId).maybeSingle();
    if (data) prefillClient = toPickOrg(data);
  }
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>新增客戶網站</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        填完按「建立」，系統只會建立紀錄，不會動主機。接著在建站流程頁一步一步做。
      </p>
      {prefill && <p role="status" className="form-hint" style={{ margin: "0 0 16px" }}>已用客戶問卷的資料先填好下面的欄位（客戶、網址、語言、外掛組合），請確認後再按「建立」。</p>}
      {blockedQuote && (
        <p role="alert" style={{ margin: "0 0 16px", fontSize: 13, color: "var(--badge-red-text)", background: "var(--badge-red-bg)", padding: "8px 10px", borderRadius: 8 }}>
          這份問卷的報價還沒核准（{blockedQuote}），不能用它建站。報價核准後再從客戶問卷按一次。
        </p>
      )}
      <NewSiteForm orgs={clients} total={total} prefill={prefill ? { ...prefill, client: prefillClient } : null} />
    </div>
  );
}
