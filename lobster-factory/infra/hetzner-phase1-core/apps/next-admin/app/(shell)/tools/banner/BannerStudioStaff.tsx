"use client";
// Staff-only (/tools/banner): BannerStudio plus the calls a design door does not serve -- AI copy/design through
// script-forge (video) and brand colours from the staff client list. A door page renders BannerStudio without this
// file, so its import closure names neither route (step-8 card §2 S1).
import { useEffect, useState } from "react";
import BannerStudio, { type BannerStaffApi } from "./BannerStudio";
import { DEFAULT_AI_TEXT_MODEL } from "@/lib/ai/text-model-options";
import { roleHeader } from "@/lib/ops-role";
import type { PickOrg } from "../../ops/clients/nav-orgs";
import { OrgPicker } from "../../ops/clients/OrgPicker";

/** Clients with a valid brand colour: the first page from GET /api/ops/org-search?brandColors=1, the rest by search. */
function BrandPicker({ onPick }: { onPick(colors: string[]): void }) {
  const [first, setFirst] = useState<{ orgs: PickOrg[]; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ops/org-search?brandColors=1", { headers: { ...roleHeader("operator") } })
      .then(async (r) => {
        const d = (r.ok ? await r.json() : null) as { orgs?: PickOrg[]; total?: number } | null;
        const orgs = d?.orgs ?? [];
        if (!cancelled) setFirst({ orgs, total: d?.total ?? orgs.length });
      })
      .catch(() => { if (!cancelled) setFirst({ orgs: [], total: 0 }); });   // clients endpoint unavailable: the hint below
    return () => { cancelled = true; };
  }, []);
  if (!first) return null;
  if (first.total === 0) {
    return <p className="form-hint" style={{ marginTop: 12 }}>尚無品牌色。到 <a href="/ops/clients">客戶設定</a> 填入品牌色後即可在此選取帶入。</p>;
  }
  return (
    <div className="form-row" style={{ marginTop: 12 }}>
      <label className="form-label">選擇品牌帶入配色</label>
      <OrgPicker
        orgs={first.orgs}
        total={first.total}
        selected={selected}
        filter="brandColors"
        onPick={(org) => {
          if (!org || org.brandColors.length === 0) return;
          setSelected(org.slug);
          onPick(org.brandColors);
        }}
      />
    </div>
  );
}

const staff: BannerStaffApi = {
  scriptForge: (task, fields) => fetch("/api/tools/script-forge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify({ module: "banner", task, fields, model: DEFAULT_AI_TEXT_MODEL }),
  }),
  BrandPicker,
};

export default function BannerStudioStaff() {
  return <BannerStudio staff={staff} />;
}
