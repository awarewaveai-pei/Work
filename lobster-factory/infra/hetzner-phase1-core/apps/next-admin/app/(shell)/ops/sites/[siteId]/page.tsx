// /ops/sites/[siteId] -- the site-flow page: nine steps, top to bottom, each one's state read live from the host
// (SITE-FLOW-COMPLETION-PLAN.md §2, card SF-J). The page stores nothing; every state comes from GET /api/ops/site-flow/[siteId].
import { notFound } from "next/navigation";
import { SiteFlow } from "./SiteFlow";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SiteFlowPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  if (!UUID_RE.test(siteId)) notFound();
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <SiteFlow siteId={siteId} />
    </div>
  );
}
