import { MapPage } from "../../../../../components/blocks/MapPage";

// MAP 拆解 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <MapPage projectId={decodeURIComponent((await params).id)} />;
}
