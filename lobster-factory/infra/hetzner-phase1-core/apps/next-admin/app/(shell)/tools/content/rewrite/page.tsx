import { Suspense } from "react";
import ContentStudioStaff from "../ContentStudioStaff";

export const metadata = { title: "改寫" };

// /tools/content/rewrite: the content tool's 改寫 page (was a tab of /tools/content; blueprint §15A).
export default function ContentRewritePage() {
  return (
    <Suspense fallback={null}>
      <ContentStudioStaff view="humanize" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>改寫</h1>} />
    </Suspense>
  );
}
