// /tools/content/topics -- each month's content topics for one client site (AUTO_CONTENT_EXECUTION_PLAN.md P3.5).
import { TopicsBoard } from "./TopicsBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "題目佇列 · Content" };

export default function TopicsPage() {
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>題目佇列</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 24px" }}>
        每個月要做的文章、社群貼文和影片。題目核准後才會開始製作。
      </p>
      <TopicsBoard />
    </div>
  );
}
