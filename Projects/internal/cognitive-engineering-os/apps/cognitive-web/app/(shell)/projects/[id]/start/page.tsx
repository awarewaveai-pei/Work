import { IntakePage } from "../../../../../components/blocks/IntakePage";

// 開案 (組裝器): the case's purpose, question, risk, who is affected, places, and the blocks it will walk.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <IntakePage projectId={decodeURIComponent((await params).id)} />;
}
