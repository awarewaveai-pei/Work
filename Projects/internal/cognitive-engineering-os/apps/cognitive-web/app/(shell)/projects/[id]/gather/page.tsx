import { GatherPage } from "../../../../../components/blocks/GatherPage";

// GATHER 蒐集來源 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <GatherPage projectId={decodeURIComponent((await params).id)} />;
}
