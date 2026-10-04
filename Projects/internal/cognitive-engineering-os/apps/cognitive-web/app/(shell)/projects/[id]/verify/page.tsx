import { VerifyPage } from "../../../../../components/blocks/VerifyPage";

// VERIFY 查證主張 for one case (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <VerifyPage projectId={decodeURIComponent((await params).id)} />;
}
