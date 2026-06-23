'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg } from "@/lib/outreach/use-active-org";

interface Lead {
  id: string;
  name: string;
  industry: string | null;
  email: string | null;
  lead_quality_score: number;
  contactability_score: number;
  icp_score: number;
  score: number;
  priority: string | null;
  status: string;
}

const API = "/api/outreach/leads";

function prioBadge(p: string | null): string {
  if (p === "high") return "badge-green";
  if (p === "not_recommended") return "badge-red";
  return "badge-gray";
}

export default function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");

  const org = useActiveOrg();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (priority) qs.set("priority", priority);
      if (status) qs.set("status", status);
      if (org) qs.set("organizationId", org);
      const r = await fetch(`${API}?${qs.toString()}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setLeads(j.leads as Lead[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [priority, status, org]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string) {
    if (!window.confirm("刪除這個 lead？")) return;
    setErr(null);
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "delete failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="card-sub">篩選：</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">全部優先級</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="not_recommended">Not Recommended</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部狀態</option>
          <option value="new">new</option>
          <option value="qualified">qualified</option>
          <option value="message_generated">message_generated</option>
          <option value="sent">sent</option>
        </select>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-label">Leads（{leads.length}）</span></div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : leads.length === 0 ? (
          <p className="card-sub">尚無 leads。到 Lead Inbox 核可名單，或手動新增。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th className="card-sub">名稱</th>
                <th className="card-sub">產業</th>
                <th className="card-sub">Q/C/ICP</th>
                <th className="card-sub">總分</th>
                <th className="card-sub">優先級</th>
                <th className="card-sub">狀態</th>
                <th className="card-sub"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td className="card-sub">{l.industry ?? "—"}</td>
                  <td className="card-sub">{l.lead_quality_score}/{l.contactability_score}/{l.icp_score}</td>
                  <td><strong>{l.score}</strong></td>
                  <td><span className={`card-badge ${prioBadge(l.priority)}`}>{l.priority ?? "—"}</span></td>
                  <td className="card-sub">{l.status}</td>
                  <td><button type="button" className="btn-secondary" onClick={() => void remove(l.id)}>刪除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
