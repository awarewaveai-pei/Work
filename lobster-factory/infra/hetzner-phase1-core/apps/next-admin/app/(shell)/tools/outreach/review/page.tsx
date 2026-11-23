import QueueClient from "./QueueClient";
import ReviewClient from "./ReviewClient";

export const metadata = { title: "審核信件 · 開發信" };

export default function MessageReviewPage() {
  return (
    <>
      <div className="topbar">
        <h1 className="topbar-title" style={{ margin: 0, fontFamily: "inherit" }}>審核信件</h1>
        <span className="topbar-env">Cold Gate · Evidence · Safety · 人工審核（不自動寄）</span>
      </div>
      <QueueClient />
      <ReviewClient />
    </>
  );
}
