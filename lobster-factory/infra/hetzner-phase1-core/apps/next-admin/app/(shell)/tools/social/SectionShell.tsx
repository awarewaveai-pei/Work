// The shell of a section that is not open yet (SOCIAL_MANAGER_PLAN.md C19): its title and one empty state saying what
// it will do (copy: agency-os/reports/oracle/2026-10-17-inspect-9551174c.md). Each one's own card replaces it:
// analytics C24, reporting C25, smart links C26, flows C27, ads C28, inbox C29.
import Icon, { type IconName } from "./Icon";
import type { OtherSection } from "./routes";

export const NOT_OPEN: Record<OtherSection | "flows", { title: string; icon: IconName; line: string; hint: string }> = {
  analytics: { title: "數據分析", icon: "chart", line: "數據分析尚未開通", hint: "開通後可查看各頻道的追蹤人數、觸及、互動與趨勢；各平台核准分析權限後才有真實資料。" },
  reporting: { title: "報表管理", icon: "report", line: "報表管理尚未開通", hint: "選擇頻道與期間，產出給客戶查看的 PDF 成效報表，之後可每月自動寄出。" },
  inbox: { title: "訊息收件匣", icon: "inbox", line: "訊息收件匣尚未開通", hint: "開通後顯示各頻道未讀留言與私訊，並可開啟 Chatwoot 收件匣回覆。" },
  smartlinks: { title: "智慧連結", icon: "link", line: "智慧連結尚未開通", hint: "建立社群個人簡介連結頁，集中放置多個連結並查看各連結的點擊次數。" },
  ads: { title: "廣告管理", icon: "megaphone", line: "廣告管理尚未開通", hint: "開通後可查看 Facebook／Instagram 廣告花費、成效並管理活動；須先取得 Meta 廣告權限。" },
  flows: { title: "自動化流程", icon: "flow", line: "自動化流程尚未開通", hint: "開通後可設定品牌與單則貼文的留言關鍵字回覆，單則規則優先；Meta 核准後才會回覆。" },
};

export default function SectionShell({ which }: { which: OtherSection | "flows" }) {
  const s = NOT_OPEN[which];
  return (
    <section className="sm-panel" aria-label={s.title}>
      <div className="sm-ptop"><h2>{s.title}</h2></div>
      <div className="sm-empty">
        <span className="sm-eic"><Icon name={s.icon} /></span>
        <b>{s.line}</b>
        <p className="sm-muted">{s.hint}</p>
      </div>
    </section>
  );
}
