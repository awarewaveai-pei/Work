import { Suspense } from "react";
import ContentStudio from "../(shell)/tools/content/ContentStudio";

export const metadata = { title: "內容編輯" };

// content.<base domain>/ -> /content: ContentStudio without ContentStudioStaff's AI-video calls (video is optional for
// content; step-8 card §2 S1), so the AI-video option does not show on the door.
export default function ContentDoorPage() {
  return (
    <Suspense fallback={null}>
      <ContentStudio />
    </Suspense>
  );
}
