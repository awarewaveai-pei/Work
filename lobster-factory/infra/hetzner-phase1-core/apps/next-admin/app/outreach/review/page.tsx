import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Message Review · Cold Outreach" };

export default function MessageReviewPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Message Review 文案審核中心</span>
        <span className="topbar-env">Cold Gate · Evidence · Safety · 人工審核</span>
      </div>
      <OutreachStub
        title="Message Review"
        sub="AI 不直接寄信。所有文案先在此審核：個人化 / 安全分數 / evidence_snapshot / 禁用詞檢查。"
        next={[
          "Approve 通過 Quality Gate 的文案",
          "建立客戶 Gmail 草稿（人工寄）",
          "不過 gate → 重生或補觀察點",
        ]}
      />
    </>
  );
}
