import { VersionsPage } from "../../../../../../components/blocks/GovernPage";

// Which model and instructions answered in this case, and the rules in use.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <VersionsPage projectId={decodeURIComponent((await params).id)} />;
}
