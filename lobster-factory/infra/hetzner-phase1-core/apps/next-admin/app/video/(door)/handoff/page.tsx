import { staffHosts } from "@/lib/portal/hosts";
import ScriptHistoryHandoff from "./ScriptHistoryHandoff";

export const metadata = { title: "開啟影音工作台" };

// video.<base domain>/handoff?open=<workbench page>: where the staff door's 「開啟影音工作台」 lands (lib/video/script-history.ts).
export default async function VideoHandoffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const open = (await searchParams).open;
  return <ScriptHistoryHandoff staffHosts={staffHosts()} open={typeof open === "string" ? open : null} />;
}
