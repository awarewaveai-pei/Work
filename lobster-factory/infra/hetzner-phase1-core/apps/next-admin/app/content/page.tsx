import { Suspense } from "react";
import { ContentOverview } from "./ContentOverview";

export const metadata = { title: "概覽" };

// content.<base domain>/ -> /content: the door's home (blueprint §15A rule 4). Writing is /write.
export default function ContentDoorPage() {
  return (
    <div className="page">
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0, color: "var(--text-primary)" }}>概覽</h1>
      <Suspense fallback={null}>
        <ContentOverview />
      </Suspense>
    </div>
  );
}
