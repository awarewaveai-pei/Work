"use client";

// Provisioning tab summary (card SF-J): the same nine-step state as /ops/sites/[siteId], read live per site.
// Nothing here is stored or hard-coded; a site whose state cannot be read says so instead of showing a tick.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, NoData, Tag } from "./hub-ui";
import { FLOW_STEPS, doneCount, viewOf, type ApiStep } from "@/lib/site-flow/page-model";

export interface FlowSite { id: string; name: string; domain: string | null }

type Row = { state: "loading" } | { state: "error"; text: string } | { state: "ok"; done: number; next: string | null };

export function SiteFlowSummary({ sites }: { sites: FlowSite[] }) {
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    let live = true;
    for (const s of sites) {
      fetch(`/api/ops/site-flow/${s.id}`)
        .then(async (r) => ({ r, j: (await r.json().catch(() => ({}))) as { ok?: boolean; steps?: ApiStep[]; error?: string } }))
        .then(({ r, j }) => {
          if (!live) return;
          if (!r.ok || !j.ok || !j.steps) return setRows((c) => ({ ...c, [s.id]: { state: "error", text: r.status === 404 ? "還沒有正式環境" : "讀取失敗" } }));
          const views = FLOW_STEPS.map((def) => viewOf(def, def.engineKey ? j.steps!.find((x) => x.key === def.engineKey) ?? null : null));
          const next = views.find((v) => v.def.engineKey && v.stateLabel !== "完成");
          setRows((c) => ({ ...c, [s.id]: { state: "ok", done: doneCount(views), next: next ? `第 ${next.def.no} 步 ${next.def.title}（${next.stateLabel}）` : null } }));
        })
        .catch(() => live && setRows((c) => ({ ...c, [s.id]: { state: "error", text: "連不上伺服器" } })));
    }
    return () => { live = false; };
  }, [sites]);

  return (
    <Card title="建站流程" action={<Link href="/ops/sites/new" style={{ fontSize: 11, color: "var(--accent-text)", textDecoration: "none" }}>新增客戶網站 →</Link>}>
      {sites.length === 0 ? (
        <NoData>這個客戶還沒有用建站流程建立的網站。</NoData>
      ) : (
        sites.map((s) => {
          const row = rows[s.id] ?? { state: "loading" as const };
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 0", fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</span>
              <span style={{ color: "var(--text-muted)" }}>{s.domain ?? "尚未設定網址"}</span>
              {row.state === "loading" && <span style={{ color: "var(--text-muted)" }}>讀取中…</span>}
              {row.state === "error" && <Tag tone="gray">{row.text}</Tag>}
              {row.state === "ok" && <Tag tone={row.done === FLOW_STEPS.filter((d) => d.engineKey).length ? "green" : "accent"}>{row.done} / {FLOW_STEPS.filter((d) => d.engineKey).length} 完成</Tag>}
              {row.state === "ok" && row.next && <span style={{ color: "var(--text-muted)" }}>下一步：{row.next}</span>}
              <Link href={`/ops/sites/${s.id}`} style={{ marginLeft: "auto", color: "var(--accent-text)", textDecoration: "none" }}>打開建站流程 →</Link>
            </div>
          );
        })
      )}
    </Card>
  );
}
