import { Suspense } from "react";
import ContentStudio from "../../(shell)/tools/content/ContentStudio";

export const metadata = { title: "草稿" };

// content.<base domain>/drafts, as staff open it at /tools/content/drafts.
export default function ContentDoorDraftsPage() {
  return (
    <Suspense fallback={null}>
      <ContentStudio view="drafts" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>草稿</h1>} />
    </Suspense>
  );
}
