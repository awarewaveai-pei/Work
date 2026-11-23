import { Suspense } from "react";
import ContentStudioStaff from "../ContentStudioStaff";

export const metadata = { title: "草稿" };

// /tools/content/drafts: the content tool's 草稿 page (was a tab of /tools/content; blueprint §15A).
export default function ContentDraftsPage() {
  return (
    <Suspense fallback={null}>
      <ContentStudioStaff view="drafts" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>草稿</h1>} />
    </Suspense>
  );
}
