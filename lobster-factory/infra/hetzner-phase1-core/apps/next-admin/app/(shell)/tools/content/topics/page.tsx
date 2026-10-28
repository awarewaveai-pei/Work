// /tools/content/topics -- the auto-content control page (AUTO_CONTENT P9.3): every site at a glance, then the picked site's five steps and its topics.
import { TopicsPageContent } from "./TopicsPageContent";

export const dynamic = "force-dynamic";
export const metadata = { title: "自動內容 · Content" };

export default function TopicsPage() {
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>自動內容</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 24px" }}>
        熱搜 → 題目 → 製作 → 發布，一頁管理。題目核准後才會開始製作。
      </p>
      <TopicsPageContent />
    </div>
  );
}
