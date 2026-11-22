// /ops/sites/new -- "新增客戶網站" (SITE-FLOW-COMPLETION-PLAN.md §2 step 1, card SF-J). Staff only; the API refuses anyone but owner/admin.
import { NewSiteForm } from "./NewSiteForm";

export const dynamic = "force-dynamic";

export default function NewSitePage() {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>新增客戶網站</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        填完按「建立」，系統只會建立紀錄，不會動主機。接著在建站流程頁一步一步做。
      </p>
      <NewSiteForm />
    </div>
  );
}
