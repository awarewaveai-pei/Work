import { ComputePage } from "../../../../../components/blocks/ComputePage";

// COMPUTE 計算與模擬 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ComputePage projectId={decodeURIComponent((await params).id)} />;
}
