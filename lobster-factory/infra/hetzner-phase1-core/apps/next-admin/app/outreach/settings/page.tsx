import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Settings · Cold Outreach" };

export default function OutreachSettingsPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Settings 設定</span>
        <span className="topbar-env">Service Profile · 禁用詞 · Suppression · 同步規則</span>
      </div>
      <OutreachStub
        title="Settings"
        sub="服務設定檔、品牌語氣與禁用詞、Follow-up 節奏、Suppression List、Consent / Sync 規則、Gmail 與 FluentCRM 連線。"
        next={[
          "建立 Service Profile（含 forbidden_words）",
          "維護 Suppression List（寄送前必查）",
          "設定 FluentCRM 同步規則（僅 warm / opt-in）",
        ]}
      />
    </>
  );
}
