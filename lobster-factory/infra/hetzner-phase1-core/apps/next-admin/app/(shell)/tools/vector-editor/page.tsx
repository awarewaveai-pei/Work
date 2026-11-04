export const metadata = { title: "Vector Editor · Lobster Factory" };

// 嵌入自包含的向量設計工具（public/vector-editor.html）。
// 工具是單一 HTML + CDN 函式庫，用 iframe 載入避免大規模改寫；
// 頁面本身受 middleware Supabase 登入保護，AI 去背走同源 /api/tools/studio/remove-bg。
// 外觀與 /tools/canvas 相同：標題／副標／工具列都在 iframe 內，主題 tokens 由 iframe 的
// theme bridge 從父 <html> 複製（同源），所以這裡沒有 .topbar。
export default function VectorEditorPage() {
  return (
    <iframe
      src="/vector-editor.html"
      title="Vector Editor"
      style={{ flex: 1, width: "100%", minHeight: "100vh", border: "none", display: "block" }}
    />
  );
}
