export const metadata = { title: "Vector Editor · Lobster Factory" };

// 嵌入自包含的向量設計工具（public/vector-editor.html）。
// 工具是單一 HTML + CDN 函式庫，用 iframe 載入避免大規模改寫；
// 頁面本身受 middleware Supabase 登入保護，AI 去背走同源 /api/tools/studio/remove-bg。
export default function VectorEditorPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Vector Editor</span>
        <span className="topbar-env">向量設計 · 描圖/字型/條碼/環形文字/Mockup/批次匯出 · 14 積木</span>
      </div>
      <iframe
        src="/vector-editor.html"
        title="Vector Editor"
        style={{ flex: 1, width: "100%", minHeight: "calc(100vh - 54px)", border: "none", display: "block" }}
      />
    </>
  );
}
