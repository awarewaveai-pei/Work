"use client";
// Staff-only (/tools/banner): BannerStudio plus the calls a design door does not serve -- AI copy/design through
// script-forge (video) and the staff client list (whose 我的設計 it is saved into). A door page renders BannerStudio without this
// file, so its import closure names neither route (step-8 card §2 S1).
import { useEffect, useState } from "react";
import BannerStudio from "./BannerStudio";
import type { BannerStaffApi } from "./banner-state";
import { roleHeader } from "@/lib/ops-role";
import type { PickOrg } from "../../ops/clients/nav-orgs";
import { OrgPicker } from "../../ops/clients/OrgPicker";

/** Card R3: whose 我的設計 存到圖庫 writes into -- every client (first page, then search), or 自用 (the default org). A
 *  client given by the link (?org=) that is not on the first page shows as a note until another pick. */
function SaveOrgPicker({ selected, onPick }: { selected: string | null; onPick(orgId: string | null, name?: string): void }) {
  const [first, setFirst] = useState<{ orgs: PickOrg[]; total: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ops/org-search", { headers: { ...roleHeader("operator") } })
      .then(async (r) => {
        const d = (r.ok ? await r.json() : null) as { orgs?: PickOrg[]; total?: number } | null;
        if (!cancelled) setFirst({ orgs: d?.orgs ?? [], total: d?.total ?? d?.orgs?.length ?? 0 });
      })
      .catch(() => { if (!cancelled) setFirst({ orgs: [], total: 0 }); });
    return () => { cancelled = true; };
  }, []);
  if (!first) return null;
  return (
    <>
      <OrgPicker searchPath="/api/ops/org-search" orgs={first.orgs} total={first.total} selected={selected} by="id" none="自用" onPick={(org) => onPick(org?.id ?? null, org?.name)} />
      {selected && !first.orgs.some((o) => o.id === selected) && <p className="form-hint" style={{ marginTop: 6 }}>存到開啟時指定的客戶。</p>}
    </>
  );
}

const staff: BannerStaffApi = {
  scriptForge: (task, fields, model) => fetch("/api/tools/script-forge", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body: JSON.stringify({ module: "banner", task, fields, model }),
  }),
  SaveOrgPicker,
};

export default function BannerStudioStaff() {
  return <BannerStudio staff={staff} />;
}
