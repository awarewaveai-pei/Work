import { DecidePage } from "../../../../../components/blocks/DecidePage";

// DECIDE 判斷 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DecidePage projectId={decodeURIComponent((await params).id)} />;
}
