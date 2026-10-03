import { ThinkPage } from "../../../../../components/blocks/ThinkPage";

// THINK 共思考 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ThinkPage projectId={decodeURIComponent((await params).id)} />;
}
