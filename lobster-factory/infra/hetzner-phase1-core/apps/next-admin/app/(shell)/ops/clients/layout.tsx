import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ClientPanelNav } from "./ClientPanelNav";
import type { OrgStub } from "./ClientPanelNav";

const ORG_COLORS = [
  "#f87171", "#60a5fa", "#4ade80", "#a78bfa", "#fbbf24",
  "#fb923c", "#34d399", "#818cf8", "#f472b6", "#2dd4bf",
];

export default async function ClientsLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  const orgs: OrgStub[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("organizations")
      .select("slug, name, metadata")
      .order("created_at", { ascending: true });
    if (data) {
      data.forEach((row, i) => {
        const meta = row.metadata as Record<string, unknown> | null;
        const color =
          (meta?.color as string | undefined) ?? ORG_COLORS[i % ORG_COLORS.length];
        orgs.push({ slug: row.slug, name: row.name, color });
      });
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <ClientPanelNav orgs={orgs} />
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
