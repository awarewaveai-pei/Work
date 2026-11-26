import { Suspense } from "react";
import { ContentOverview } from "./ContentOverview";
import { redirectOldDraftLink, type PageQuery } from "./old-draft-link";

export const metadata = { title: "概覽" };

// content.<base domain>/ -> /content: the door's home (blueprint §15A rule 4). Writing is /write.
export default async function ContentDoorPage({ searchParams }: { searchParams: Promise<PageQuery> }) {
  redirectOldDraftLink(await searchParams);
  return (
    <div className="page">
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: 0, color: "var(--text-primary)" }}>概覽</h1>
      <Suspense fallback={null}>
        <ContentOverview />
      </Suspense>
    </div>
  );
}
