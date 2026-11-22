import ReviewRelease from "./ReviewRelease";

export const metadata = { title: "審片與發布" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);

// video.<base domain>/review-release?organizationId=&asset=|project=&section=qa|release (video-unify-plan-20261116 §4 U6; K11: ReviewRelease checks organizationId is the workbench client):
// the workbench shell frames it for a finished video (asset) or an older project's videos (project). A malformed id counts as missing.
export default async function ReviewReleasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <ReviewRelease organizationId={uuid(params.organizationId)} assetId={uuid(params.asset)} projectId={uuid(params.project)} section={params.section === "release" ? "release" : "qa"} />;
}
