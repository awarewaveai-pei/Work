import { GovernPage } from "../../../../../components/blocks/GovernPage";

// GOVERN for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <GovernPage projectId={decodeURIComponent((await params).id)} />;
}
