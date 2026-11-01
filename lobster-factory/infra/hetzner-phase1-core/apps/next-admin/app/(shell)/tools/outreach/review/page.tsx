import ReviewClient from "./ReviewClient";

export const metadata = { title: "Message Review · Cold Outreach" };

export default function MessageReviewPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Message Review 文案審核中心</span>
        <span className="topbar-env">Cold Gate · Evidence · Safety · 人工審核（不自動寄）</span>
      </div>
      <ReviewClient />
    </>
  );
}
