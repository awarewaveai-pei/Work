import ReleaseDeliveryPanel from "../../(shell)/tools/video/ReleaseDeliveryPanel";

export const metadata = { title: "送審與投遞" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);

// video.<base domain>/release?organizationId=&candidateAssetId= (opened by the workbench's 「送審與投遞」): the delivery
// panel staff use inside /tools/video. A missing or malformed id falls back to the panel without a preset.
export default async function VideoReleasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const organizationId = uuid(params.organizationId);
  return (
    <ReleaseDeliveryPanel
      organizationLocked={!!organizationId}
      initialOrganizationId={organizationId}
      initialCandidateAssetId={organizationId ? uuid(params.candidateAssetId) : undefined}
    />
  );
}
