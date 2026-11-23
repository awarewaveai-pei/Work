import { Suspense } from "react";
import ContentStudioStaff from "./ContentStudioStaff";

export const metadata = { title: "寫文章" };

// /tools/content: 寫文章 (blueprint §15A); 改寫 and 草稿 are its sub-pages rewrite/ and drafts/.
export default function ContentPage() {
  return (
    <Suspense fallback={null}>
      <ContentStudioStaff view="generate" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>寫文章</h1>} />
    </Suspense>
  );
}
