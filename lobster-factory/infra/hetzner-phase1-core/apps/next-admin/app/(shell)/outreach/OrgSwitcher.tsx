'use client';
import { useSearchParams } from "next/navigation";
import type { PickOrg } from "../ops/clients/nav-orgs";
import { OrgUrlPicker } from "../ops/clients/OrgPicker";

// 代操 client switcher. Writes ?org=<uuid> into the URL; all outreach pages read it via useActiveOrg.
// orgs = the first NAV_FIRST clients (layout.tsx); the picker searches the rest.
export function OrgSwitcher({ orgs, total }: { orgs: PickOrg[]; total: number }) {
  const cur = useSearchParams().get("org") ?? "";
  const curName = orgs.find((o) => o.id === cur)?.name;
  return (
    <div className="topbar" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
      <span className="topbar-title">操作客戶</span>
      <div style={{ flex: 1, minWidth: 260 }}>
        <OrgUrlPicker orgs={orgs} total={total} param="org" by="id" none="自用 / 未指定" />
      </div>
      {cur ? (
        <span className="card-badge badge-green">代操中：{curName ?? cur.slice(0, 8)}</span>
      ) : (
        <span className="card-badge badge-gray">自用 / 全部</span>
      )}
    </div>
  );
}
