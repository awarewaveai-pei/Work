// /ops/schedules — every client's routine jobs on one page (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md).
// The client page's 維護 tab renders the same ScheduleTable for one client.
import { ScheduleTable } from "./ScheduleTable";

export const dynamic = "force-dynamic";

export default function SchedulesPage() {
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px", color: "var(--text-primary)" }}>排程</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0 0 20px", fontSize: 13, lineHeight: 1.7 }}>
        每一列是一種例行工作，每一欄是一個客戶。勾選就是開啟；點一格，右邊會顯示頻率、時間和上次執行的結果。
        新客戶預設全部關閉（網站巡檢除外：有網址的客戶會自動開始每天巡檢）。
      </p>
      <ScheduleTable />
    </div>
  );
}
