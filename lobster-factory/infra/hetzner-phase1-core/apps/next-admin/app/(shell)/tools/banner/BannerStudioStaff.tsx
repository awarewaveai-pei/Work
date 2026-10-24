"use client";
// Staff-only (/tools/banner): BannerStudio plus the calls a design door does not serve -- AI copy/design through
// script-forge (video) and brand colours from the staff client list. A door page renders BannerStudio without this
// file, so its import closure names neither route (step-8 card §2 S1).
import BannerStudio, { type BannerStaffApi } from "./BannerStudio";
import { DEFAULT_AI_TEXT_MODEL } from "@/lib/ai/text-model-options";
import { roleHeader } from "@/lib/ops-role";

type ClientRow = { slug: string; name: string; clientConfig?: { brandColors?: { primary?: string; secondary?: string; accent?: string } } };

const staff: BannerStaffApi = {
  scriptForge: (task, fields) => fetch("/api/tools/script-forge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify({ module: "banner", task, fields, model: DEFAULT_AI_TEXT_MODEL }),
  }),
  brandClients: async () => {
    const r = await fetch("/api/ops/clients", { headers: { ...roleHeader("operator") } });
    const d = (r.ok ? await r.json() : null) as { clients?: ClientRow[] } | null;
    return (d?.clients ?? [])
      .map((c) => {
        const bc = c.clientConfig?.brandColors;
        const colors = [bc?.primary, bc?.secondary, bc?.accent].filter((x): x is string => !!x && /^#[0-9a-fA-F]{6}$/.test(x));
        return { slug: c.slug, name: c.name, colors };
      })
      .filter((c) => c.colors.length > 0);
  },
};

export default function BannerStudioStaff() {
  return <BannerStudio staff={staff} />;
}
