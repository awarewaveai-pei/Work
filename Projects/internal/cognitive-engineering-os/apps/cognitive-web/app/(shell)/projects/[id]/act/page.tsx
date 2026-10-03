import { ActPage } from "../../../../../components/blocks/ActPage";

// ACT 行動與觀察 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ActPage projectId={decodeURIComponent((await params).id)} />;
}
