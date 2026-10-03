import { ContractPage } from "../../../../../components/blocks/ContractPage";

// 協作合約 for one case: what the AI may do here (the person's own; the API answers 404 for anyone else's).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ContractPage projectId={decodeURIComponent((await params).id)} />;
}
