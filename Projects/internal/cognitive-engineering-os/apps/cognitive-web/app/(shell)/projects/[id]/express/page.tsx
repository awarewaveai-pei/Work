import { ExpressPage } from "../../../../../components/blocks/ExpressPage";

// EXPRESS is case-owned: the API checks that the signed-in person owns this case.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ExpressPage projectId={decodeURIComponent((await params).id)} />;
}
