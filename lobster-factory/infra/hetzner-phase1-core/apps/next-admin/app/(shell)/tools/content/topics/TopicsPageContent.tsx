// The control page's server half (AUTO_CONTENT P9.3), shared by staff /tools/content/topics and the content door's /topics:
// loads every number once, scoped to the caller (a client sees only their own sites), and hands it to the board.
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/content/topics/overview-load";
import { TopicsBoard } from "./TopicsBoard";

export async function TopicsPageContent() {
  const sb = getSupabaseWriteClient();
  if (!sb) return <p style={{ color: "var(--text-muted)" }}>Supabase 未設定，無法讀取。</p>;
  return <TopicsBoard overview={await loadOverview(sb, new Request("http://localhost", { headers: await headers() }))} />;
}
