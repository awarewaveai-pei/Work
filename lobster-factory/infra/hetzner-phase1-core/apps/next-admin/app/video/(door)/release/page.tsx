import { redirect } from "next/navigation";

export const metadata = { title: "送審與投遞" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);

// video.<base domain>/release?organizationId=&candidateAssetId= (older links of the workbench's 「送審與投遞」): the delivery
// panel now lives in the workbench shell (video-unify-plan-20261116 §4 U6), so this goes there -- to the release half.
// Without a video to open it on, the shell's home.
export default async function VideoReleasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const organizationId = uuid(params.organizationId);
  const asset = uuid(params.candidateAssetId);
  if (!organizationId || !asset) redirect("/");
  redirect(`/?${new URLSearchParams({ open: "review-release", organizationId, asset, section: "release" })}`);
}
