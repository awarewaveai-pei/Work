import { Suspense } from "react";
import ContentStudio from "../../(shell)/tools/content/ContentStudio";

export const metadata = { title: "寫文章" };

// content.<base domain>/write: ContentStudio without ContentStudioStaff's AI-video calls (video is optional for
// content; step-8 card §2 S1), so the AI-video option does not show on the door.
export default function ContentDoorWritePage() {
  return (
    <Suspense fallback={null}>
      <ContentStudio view="generate" heading={<h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>寫文章</h1>} />
    </Suspense>
  );
}
