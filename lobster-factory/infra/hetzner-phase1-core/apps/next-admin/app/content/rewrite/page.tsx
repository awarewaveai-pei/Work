import { Suspense } from "react";
import ContentStudio from "../../(shell)/tools/content/ContentStudio";

export const metadata = { title: "改寫" };

// content.<base domain>/rewrite, as staff open it at /tools/content/rewrite.
export default function ContentDoorRewritePage() {
  return (
    <Suspense fallback={null}>
      <ContentStudio view="humanize" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>改寫</h1>} />
    </Suspense>
  );
}
