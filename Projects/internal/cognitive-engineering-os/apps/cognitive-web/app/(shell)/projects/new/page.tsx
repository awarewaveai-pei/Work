import { IntakePage } from "../../../../components/blocks/IntakePage";

// 開一個新案子 (陪我思考 on the home page, 開新案子 in the menu): 開案 with no project yet -- IntakePage creates the project
// and its 開案資料 together when 開案 is pressed. ?q= is the home page's sentence (ENTRY_SLICE1_CHECKLIST.md item 6).
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const q = (await searchParams).q;
  return <IntakePage question={typeof q === "string" ? q.slice(0, 2000) : ""} />;
}
