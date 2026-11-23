"use client";

// 帳務 tab on the client hub only (ClientHubTabs.tsx puts it in BillingTab's slot; /ops/billing shares BillingTab but not
// this card -- its tool, ops/billing, does not own the write API). Who operates each product for this account (0178; ADR 017 §0 operation axis). Two visible buttons per product,
// no dropdown. Writes through POST /api/ops/clients/[slug]/operations; the page shows what the server answered.
import { useState } from "react";
import type { Operator, OperationsData } from "@/lib/entitlements/operations";
import { Card, ChipBtn, NoData } from "./hub-ui";

const LABEL: Record<Operator, string> = { customer: "客戶自己操作", awarewave: "AwareWave 代操" };
const ERRORS: Record<string, string> = {
  forbidden_role: "只有擁有者或管理員、且有「帳務」權限的人可以切換。",
  internal_account: "AwareWave 自己的帳戶不需要設定。",
  not_a_customer_account: "這個帳戶不是客戶的主帳戶，不能設定。",
};

export function OperationsCard({ slug, data }: { slug: string; data: OperationsData }) {
  const [rows, setRows] = useState(data.products);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(product: string, operatedBy: Operator) {
    setBusy(product);
    setError(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/operations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, operatedBy }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; operatedBy?: Operator };
      if (!res.ok || !out.ok || !out.operatedBy) setError(ERRORS[out.error ?? ""] ?? "沒有存到，請再試一次。");
      else setRows((rs) => rs && rs.map((r) => (r.key === product ? { ...r, operatedBy: out.operatedBy! } : r)));
    } catch {
      setError("沒有存到，請再試一次。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="誰在操作" badge="沒設定＝客戶自己操作">
      {data.error || !rows ? <NoData>讀不到操作設定：{data.error ?? "沒有資料"}</NoData> : (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-primary)" }}>
              <span style={{ minWidth: 140 }}>{r.name}</span>
              {(Object.keys(LABEL) as Operator[]).map((op) => (
                <ChipBtn key={op} label={LABEL[op]} active={r.operatedBy === op} disabled={!data.canEdit || busy !== null}
                  title={data.canEdit ? undefined : "只有擁有者或管理員可以切換"}
                  onClick={() => { if (r.operatedBy !== op) void choose(r.key, op); }} />
              ))}
            </div>
          ))}
          {error ? <div role="alert" style={{ fontSize: 12, color: "var(--badge-red-text)" }}>{error}</div> : null}
        </div>
      )}
    </Card>
  );
}
