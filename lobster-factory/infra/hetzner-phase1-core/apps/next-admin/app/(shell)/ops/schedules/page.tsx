// /ops/schedules — every client's routine jobs on one page (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md).
// The client page's 維護 tab renders the same ScheduleTable for one client.
import { ScheduleTable } from "./ScheduleTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "排程 · Ops" };

export default function SchedulesPage() {
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>排程</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 24px" }}>
        這裡可以設定客戶工作何時執行。新客戶的排程預設全部關閉，只有網站巡檢會開啟。
      </p>
      <ScheduleTable />
    </div>
  );
}
