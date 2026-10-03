import { SensePage } from "../../../../../components/blocks/SensePage";

// SENSE 外化 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <SensePage projectId={decodeURIComponent((await params).id)} />;
}
