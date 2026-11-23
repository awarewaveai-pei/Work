import { staffHosts } from "@/lib/portal/hosts";
import { normalizeQuery } from "@/lib/client-context/contract";
import ScriptHistoryHandoff from "./ScriptHistoryHandoff";

export const metadata = { title: "開啟影片工作台" };

// video.<base domain>/handoff?open=<workbench page>&org=<uuid>: where the staff door's 「開啟影音工作台」 lands
// (lib/video/script-history.ts). org (card K11, ADR 020 §2.4) goes on to the workbench shell; a malformed one is dropped.
export default async function VideoHandoffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const open = params.open;
  const org = typeof params.org === "string" ? normalizeQuery(new URLSearchParams({ org: params.org })).org : null;
  return <ScriptHistoryHandoff staffHosts={staffHosts()} open={typeof open === "string" ? open : null} org={org} />;
}
