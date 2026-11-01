import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Replies · Cold Outreach" };

export default function RepliesPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Replies 回覆處理中心</span>
        <span className="topbar-env">Reply Copilot · 意圖判斷 · 下一步</span>
      </div>
      <OutreachStub
        title="Replies"
        sub="收到回覆後 Reply Copilot 判斷意圖（有興趣 / 詢價 / 拒絕 / 退訂）並建議下一步。"
        next={[
          "處理「有興趣」回覆 → 傳提案",
          "變暖 → 同步客戶 FluentCRM",
          "拒絕 / 退訂 → 加入 suppression",
        ]}
      />
    </>
  );
}
