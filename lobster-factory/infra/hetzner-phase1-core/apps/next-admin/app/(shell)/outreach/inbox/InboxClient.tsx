'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface InboxItem {
  id: string;
  normalized_name: string | null;
  email: string | null;
  website: string | null;
  normalized_industry: string | null;
  quality_score: number;
  contactability_score: number;
  inbox_status: string;
  source_url: string | null;
}

interface FormState {
  name: string;
  email: string;
  website: string;
  industry: string;
  sourceUrl: string;
  observation: string;
}

const EMPTY: FormState = { name: "", email: "", website: "", industry: "", sourceUrl: "", observation: "" };
const INBOX_API = "/api/outreach/inbox";
const LEADS_API = "/api/outreach/leads";

function badge(status: string): string {
  if (status === "high_quality") return "badge-green";
  if (status === "risky") return "badge-red";
  return "badge-gray";
}

export default function InboxClient() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [bulk, setBulk] = useState("");

  const org = useActiveOrg();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(withOrg(INBOX_API, org));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setItems(j.items as InboxItem[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() && !form.email.trim()) {
      setErr("至少填名稱或 email");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(INBOX_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: form, organizationId: org }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "import failed");
      setForm(EMPTY);
      setMsg(`已匯入 ${j.imported} 筆`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importBulk() {
    setErr(null);
    setMsg(null);
    let leads: unknown;
    try {
      leads = JSON.parse(bulk);
    } catch {
      setErr("批次匯入需要合法 JSON 陣列，例：[{\"name\":\"A\",\"email\":\"a@b.com\"}]");
      return;
    }
    if (!Array.isArray(leads)) {
      setErr("JSON 必須是陣列");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(INBOX_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leads, organizationId: org }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "import failed");
      setBulk("");
      setMsg(`批次匯入 ${j.imported} 筆 — ${JSON.stringify(j.summary)}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    setErr(null);
    try {
      const r = await fetch(LEADS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromInboxId: id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "approve failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    setErr(null);
    try {
      const r = await fetch(`${INBOX_API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
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
      {msg && <div className="card-badge badge-green">{msg}</div>}

      <form className="card" onSubmit={addOne} style={{ display: "grid", gap: 8 }}>
        <div className="card-header"><span className="card-label">手動新增一筆</span></div>
        <input placeholder="名稱 / 品牌" value={form.name} onChange={set("name")} />
        <input placeholder="Email" value={form.email} onChange={set("email")} />
        <input placeholder="官網" value={form.website} onChange={set("website")} />
        <input placeholder="產業" value={form.industry} onChange={set("industry")} />
        <input placeholder="來源 URL（source_url，冷信必備）" value={form.sourceUrl} onChange={set("sourceUrl")} />
        <input placeholder="觀察點 observation（冷信必備）" value={form.observation} onChange={set("observation")} />
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "處理中…" : "匯入收件匣"}</button>
      </form>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div className="card-header"><span className="card-label">批次匯入（JSON 陣列）</span></div>
        <textarea
          rows={4}
          placeholder='[{"name":"Acme","email":"hi@acme.com","website":"acme.com","industry":"yoga","source_url":"https://dir/acme","observation":"常辦週末小班"}]'
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        <button type="button" className="btn-secondary" onClick={() => void importBulk()} disabled={busy || !bulk.trim()}>
          批次匯入
        </button>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-label">收件匣（{items.length}）</span></div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : items.length === 0 ? (
          <p className="card-sub">收件匣為空。手動或批次匯入名單即可開始。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
            {items.map((it) => (
              <li key={it.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{it.normalized_name ?? it.email ?? "(未命名)"}</strong>
                  {it.normalized_industry ? <span className="card-sub"> · {it.normalized_industry}</span> : null}
                  <span className="card-sub"> · Q{it.quality_score}/C{it.contactability_score}</span>
                  <span className={`card-badge ${badge(it.inbox_status)}`} style={{ marginLeft: 8 }}>{it.inbox_status}</span>
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={it.inbox_status === "risky" || it.inbox_status === "approved"}
                    onClick={() => void approve(it.id)}
                    title={it.inbox_status === "risky" ? "suppression 命中，不可開發" : "核可進 Leads"}
                  >
                    Approve → Leads
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => void remove(it.id)}>刪除</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
