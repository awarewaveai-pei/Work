'use client';
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface OrgOption {
  id: string;
  name: string;
}

// 代操 client switcher. Writes ?org=<uuid> into the URL; all outreach pages read it via useActiveOrg.
export function OrgSwitcher({ orgs }: { orgs: OrgOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const cur = sp.get("org") ?? "";

  function pick(v: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (v) params.set("org", v);
    else params.delete("org");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const curName = orgs.find((o) => o.id === cur)?.name;
  return (
    <div className="topbar" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="topbar-title">操作客戶</span>
      <select value={cur} onChange={(e) => pick(e.target.value)} style={{ minWidth: 220 }}>
        <option value="">— 自用 / 未指定（organization_id = null）—</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {cur ? (
        <span className="card-badge badge-green">代操中：{curName ?? cur.slice(0, 8)}</span>
      ) : (
        <span className="card-badge badge-gray">自用 / 全部</span>
      )}
    </div>
  );
}
