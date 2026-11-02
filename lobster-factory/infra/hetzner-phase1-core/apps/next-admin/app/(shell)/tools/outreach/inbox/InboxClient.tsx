'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";
import { DISCOVER_COST_TWD, MAX_DISCOVER, creditsTwd } from "@/lib/outreach/discover";
import { GCIS_ATTRIBUTION, GCIS_COUNTIES, GCIS_MAX_COMPANIES, GCIS_MAX_SERPER_CREDITS } from "@/lib/outreach/sources/gcis";

interface InboxItem {
  id: string;
  normalized_name: string | null;
  email: string | null;
  website: string | null;
  social_url: string | null;
  phone: string | null;
  region: string | null;
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
// Only http(s) becomes a link: website and source_url are imported text, and a javascript: URL in href runs on click.
const httpUrl = (v: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
const twd = (v: number) => `NT$${v < 1 ? v.toFixed(2) : Math.ceil(v)}`;

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
  const [find, setFind] = useState({ query: "", location: "" });
  const [co, setCo] = useState({ text: "", county: "" });
  const [coItems, setCoItems] = useState<Array<{ code: string; desc: string }> | null>(null);
  const [coPick, setCoPick] = useState<{ code: string; desc: string } | null>(null);

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

  async function discover(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(INBOX_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discover: find, organizationId: org }),
      });
      const j = await r.json();
      const cost = j.discovery ? `（用了 ${j.discovery.credits} 次查詢，約 ${twd(j.discovery.twd)}）` : "";
      if (!j.ok) throw new Error(`${j.detail || j.error || "查詢失敗"}${cost}`);
      const dup = j.summary?.suspected_dup ?? 0;
      const skipped = j.discovery?.skipped ? `；${j.discovery.skipped} 家沒有網站也沒有電話，沒放進來` : "";
      setMsg(`${j.imported ? `找到 ${j.imported} 家，已放進收件匣${dup ? `，其中 ${dup} 家已在名單或收件匣裡（標成 suspected_dup）` : ""}` : "沒有找到可聯絡的店家"}${skipped}${cost}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function findItems(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    setCoPick(null);
    try {
      const r = await fetch(INBOX_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gcisItems: co.text, organizationId: org }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "查詢失敗");
      setCoItems(j.items as Array<{ code: string; desc: string }>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importCompanies() {
    if (!coPick || !co.county) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await fetch(INBOX_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gcis: { item: coPick.code, itemDesc: coPick.desc, county: co.county }, organizationId: org }),
      });
      const j = await r.json();
      const cost = j.discovery ? `（用了 ${j.discovery.credits} 次查詢，約 ${twd(j.discovery.twd)}）` : "";
      if (!j.ok) throw new Error(`${j.detail || j.error || "查詢失敗"}${cost}`);
      const dup = j.summary?.suspected_dup ?? 0;
      const noSite = (j.discovery?.withoutWebsite ? `；${j.discovery.withoutWebsite} 家找不到官網` : "")
        + (j.discovery?.listTruncated ? "；全國名單太長，只篩了前段，這個縣市可能還有更多" : "");
      setMsg(`${j.imported ? `找到 ${j.imported} 家公司，已放進收件匣${dup ? `，其中 ${dup} 家已在名單或收件匣裡（標成 suspected_dup）` : ""}` : "這個營業項目在該縣市沒有找到公司"}${noSite}${cost}`);
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
      if (j.existing) setMsg(`「${j.lead?.name ?? ""}」已經在名單裡，沒有再建一筆`);
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

      <form className="card" onSubmit={discover} style={{ display: "grid", gap: 8 }}>
        <div className="card-header"><span className="card-label">找名單（地圖上的店家）</span></div>
        <p className="card-sub">一次最多 {MAX_DISCOVER} 家，連網站與電話放進收件匣；沒有網站也沒有電話的店家不放。已經在名單或收件匣裡的會標成 suspected_dup。沒有 email 的，核准後按「研究這家」補。</p>
        <input placeholder="找什麼（例：咖啡廳、瑜珈教室）" value={find.query} onChange={(e) => setFind((f) => ({ ...f, query: e.target.value }))} />
        <input placeholder="地區（例：台中市；更細用英文：Xinyi District, Taipei City, Taiwan）" value={find.location}
          onChange={(e) => setFind((f) => ({ ...f, location: e.target.value }))} />
        <button type="submit" className="btn-primary" disabled={busy || !find.query.trim() || !find.location.trim()}>
          {busy ? "處理中…" : `找名單（每次最多約 ${twd(DISCOVER_COST_TWD)}）`}
        </button>
      </form>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div className="card-header"><span className="card-label">找公司（經濟部商工登記）</span></div>
        <p className="card-sub">先搜營業項目，點一個；再點縣市；一次最多 {GCIS_MAX_COMPANIES} 家，附負責人姓名，官網盡量找。沒有 email 的，核准後按「研究這家」補。</p>
        <form onSubmit={findItems} style={{ display: "flex", gap: 8 }}>
          <input style={{ flex: 1 }} placeholder="營業項目（例：餐館、咖啡、F501060，或代碼）" value={co.text}
            onChange={(e) => setCo((c) => ({ ...c, text: e.target.value }))} />
          <button type="submit" className="btn-secondary" disabled={busy || !co.text.trim()}>搜尋營業項目</button>
        </form>
        {coItems && (coItems.length === 0 ? <p className="card-sub">沒有符合的營業項目（目前只支援批發零售餐飲等已開放的大類）。</p> : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label="符合的營業項目">
            {coItems.map((it) => (
              <button key={it.code} type="button" className={coPick?.code === it.code ? "btn-primary" : "btn-secondary"}
                aria-pressed={coPick?.code === it.code} onClick={() => setCoPick(it)}>{it.code} {it.desc}</button>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label="縣市">
          {GCIS_COUNTIES.map((c) => (
            <button key={c} type="button" className={co.county === c ? "btn-primary" : "btn-secondary"}
              aria-pressed={co.county === c} onClick={() => setCo((x) => ({ ...x, county: c }))}>{c}</button>
          ))}
        </div>
        <button type="button" className="btn-primary" disabled={busy || !coPick || !co.county} onClick={() => void importCompanies()}>
          {busy ? "處理中…" : `找公司${coPick && co.county ? `：${coPick.desc}／${co.county}` : ""}（每次最多約 ${twd(creditsTwd(GCIS_MAX_SERPER_CREDITS))}）`}
        </button>
      </div>

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
                  {it.phone ? <span className="card-sub"> · {it.phone}</span> : null}
                  {httpUrl(it.website) ? <span className="card-sub"> · <a href={httpUrl(it.website)!} target="_blank" rel="noreferrer">網站</a></span>
                    : httpUrl(it.social_url) ? <span className="card-sub"> · <a href={httpUrl(it.social_url)!} target="_blank" rel="noreferrer">社群頁</a></span> : null}
                  {httpUrl(it.source_url) ? <span className="card-sub"> · <a href={httpUrl(it.source_url)!} target="_blank" rel="noreferrer">來源</a></span> : null}
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
      <p className="card-sub">{GCIS_ATTRIBUTION}</p>
    </div>
  );
}
