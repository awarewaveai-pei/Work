import { LearnPage } from "../../../../../components/blocks/LearnPage";

// LEARN 回顧校準 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <LearnPage projectId={decodeURIComponent((await params).id)} />;
}
