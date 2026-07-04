import { OutreachStub } from "../_components/OutreachStub";

export const metadata = { title: "Draft Queue · Cold Outreach" };

export default function DraftQueuePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Draft Queue 草稿審核佇列</span>
        <span className="topbar-env">批次審稿 · 快捷鍵 A/R/S/C/D</span>
      </div>
      <OutreachStub
        title="Draft Queue"
        sub="已產生、待人工處理的文案佇列：待審 / 需改 / 已批 / 已建草稿。"
        next={[
          "批次 Approve 高品質草稿",
          "建立 Gmail 草稿後標記 drafted",
          "守 sender 每日上限，避免聲譽風險",
        ]}
      />
    </>
  );
}
