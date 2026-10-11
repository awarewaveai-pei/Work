import { IntakePage } from "../../../../../components/blocks/IntakePage";

// 開案 (組裝器): the case's purpose, question, risk, who is affected, places, and the blocks it will walk. ?q= is the
// sentence the home page's 陪我思考 carried here (ENTRY_SLICE1_CHECKLIST.md item 6).
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const q = (await searchParams).q;
  return <IntakePage projectId={decodeURIComponent((await params).id)} question={typeof q === "string" ? q.slice(0, 2000) : ""} />;
}
