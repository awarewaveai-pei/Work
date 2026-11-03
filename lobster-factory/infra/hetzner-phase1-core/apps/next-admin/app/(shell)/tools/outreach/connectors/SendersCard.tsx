'use client';
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { withOrg } from "@/lib/outreach/use-active-org";
import { stageCap } from "@/lib/outreach/sender";

// The cold mailboxes and their signature (SPEC D12). Every generated email ends with it, word for word. On top, the
// sender-pool table (card C8.4): per mailbox its domain, DNS, warm-up stage, today's sends against the cap, 7-day
// bounce rate, health, the 自動寄出 switch (on = the address typed back) and 重新檢查並恢復.
interface Sender {
  id: string;
  email: string;
  display_name: string | null;
  stream_type: string;
  signature_block: string | null;
  default_signature: string;
  send_mode: string;
  daily_limit: number;
  warmup_stage: string;
  health_status: string;
  dns_status: { spf: boolean; dkim: boolean; dmarc: boolean } | null;
  dns_checked_at: string | null;
  last_sync_at: string | null;
  rescan_days: number | null;
  today_claims: number | null;
  bounce_rate_7d: number | null;
  test_send_until: string | null;
  test_recipients: string[];
}

const DEFAULT_TEST_TO = "peijingartstudio@gmail.com";
const testOpen = (s: Sender): boolean => !!s.test_send_until && Date.parse(s.test_send_until) > Date.now();
const taipeiHm = (iso: string): string => new Date(iso).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, hour: "2-digit", minute: "2-digit" });

const cell: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "left", verticalAlign: "middle" };

const HEALTH: Record<string, { label: string; badge: string }> = {
  healthy: { label: "正常", badge: "badge-green" },
  warning: { label: "警告", badge: "badge-yellow" },
  paused: { label: "已暫停", badge: "badge-red" },
  blocked: { label: "已封鎖", badge: "badge-red" },
};

const API = "/api/outreach/senders";

export default function SendersCard({ org }: { org: string | null }) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [testTo, setTestTo] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch(withOrg(API, org));
    const j = await r.json();
    if (!j.ok) { setMsg({ ok: false, text: j.error || "載入失敗" }); return; }
    const list = j.senders as Sender[];
    setSenders(list);
    setDrafts(Object.fromEntries(list.map((s) => [s.id, s.signature_block ?? s.default_signature])));
  }, [org]);

  useEffect(() => { void load(); }, [load]);

  async function recheck(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recheck", id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "檢查失敗");
      setMsg(j.healthy ? { ok: true, text: "檢查通過，已恢復自動寄出" } : { ok: false, text: `還不能恢復：${(j.reasons as string[]).join("；")}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function setMode(id: string, mode: "auto" | "draft") {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send_mode", id, mode, confirmEmail: typed }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "切換失敗");
      setMsg({ ok: true, text: mode === "auto" ? "已開啟自動寄出：上班時間（週一至五 9–18 點）依暖機上限輪流寄" : "已關閉自動寄出：草稿留在 Gmail 等人按寄出" });
      setConfirming(null); setTyped("");
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function testSend(id: string, hours: 0 | 1 | 8 | 24) {
    setBusy(id); setMsg(null);
    try {
      const recipients = (testTo[id] ?? DEFAULT_TEST_TO).split(/[,\n;\s]+/).map((e) => e.trim()).filter(Boolean);
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test_send", id, hours, recipients }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "切換失敗");
      setMsg({ ok: true, text: hours ? `已開啟測試自動寄送 ${hours} 小時：只寄給你列的收件人，其他人的信仍留草稿` : "已關閉測試自動寄送" });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function rescan(id: string, days: number) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rescan", id, days }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "補掃失敗");
      setMsg({ ok: true, text: `已排入補掃 ${days} 天，10 分鐘內會重讀收件匣` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, signatureBlock: drafts[id] ?? "" }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "儲存失敗");
      setMsg({ ok: true, text: "署名已儲存" });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div className="card-header"><span className="card-label">寄件信箱與署名（{senders.length}）</span></div>
      <p className="card-sub">每封信都以這段署名結尾，AI 不會改寫。預設是名稱和組織名；網站那一行請自己補上一次。</p>
      {msg && <div className={`card-badge ${msg.ok ? "badge-green" : "badge-red"}`} role={msg.ok ? undefined : "alert"}>{msg.text}</div>}
      {senders.some((s) => s.stream_type === "cold") && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["信箱", "網域", "DNS", "暖機", "今日已寄／上限", "7 日退信率", "健康", "自動寄出", ""].map((h, i) => <th key={i} style={cell}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {senders.filter((s) => s.stream_type === "cold").map((s) => {
                const auto = s.send_mode === "auto";
                const health = HEALTH[s.health_status] ?? HEALTH.blocked;
                return (
                  <tr key={s.id}>
                    <td style={cell}>{s.email}</td>
                    <td style={cell}>{s.email.split("@")[1] ?? ""}</td>
                    <td style={cell}>
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(["spf", "dkim", "dmarc"] as const).map((k) => (
                          <span key={k} className={`card-badge ${!s.dns_status ? "badge-gray" : s.dns_status[k] ? "badge-green" : "badge-red"}`}>
                            {k.toUpperCase()} {!s.dns_status ? "未檢查" : s.dns_status[k] ? "✓" : "缺"}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td style={cell}>{auto ? s.warmup_stage : "—"}</td>
                    <td style={cell}>{auto ? `${s.today_claims ?? 0}／${stageCap(s.warmup_stage, s.daily_limit)}` : "—"}</td>
                    <td style={cell}>{s.bounce_rate_7d === null ? "—" : `${(s.bounce_rate_7d * 100).toFixed(1)}%`}</td>
                    <td style={cell}><span className={`card-badge ${health.badge}`}>{health.label}</span></td>
                    <td style={cell}>
                      <span style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" className={auto ? "btn-secondary" : "btn-primary"} aria-pressed={!auto} disabled={busy === s.id || !auto}
                          onClick={() => void setMode(s.id, "draft")}>關</button>
                        <button type="button" className={auto ? "btn-primary" : "btn-secondary"} aria-pressed={auto} disabled={busy === s.id || auto}
                          onClick={() => { setConfirming(s.id); setTyped(""); setMsg(null); }}>開</button>
                      </span>
                      {confirming === s.id && !auto && (
                        <span style={{ display: "grid", gap: 4, marginTop: 6 }}>
                          <span className="card-sub">此信箱屬於寄件池：自動寄出、從暖機每日 10 封開始。請輸入 {s.email} 確認。</span>
                          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={`輸入 ${s.email} 確認開啟自動寄出`} />
                          <span style={{ display: "flex", gap: 4 }}>
                            <button type="button" className="btn-primary" disabled={busy === s.id || typed.trim().toLowerCase() !== s.email.toLowerCase()}
                              onClick={() => void setMode(s.id, "auto")}>確認開啟</button>
                            <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>取消</button>
                          </span>
                        </span>
                      )}
                    </td>
                    <td style={cell}>
                      {auto && (
                        <button type="button" className="btn-secondary" disabled={busy === s.id} onClick={() => void recheck(s.id)}>
                          {busy === s.id ? "檢查中…" : "重新檢查並恢復"}
                        </button>
                      )}
                      {!auto && (
                        <span style={{ display: "grid", gap: 4, minWidth: 220 }}>
                          <span className="card-sub">測試自動寄送：只寄給下面的收件人，其他人的信照舊留草稿。同一個地址 30 天最多收 2 封；要多測就用 peijingartstudio+t1@gmail.com、+t2… 這種地址，都會進你的信箱。</span>
                          {testOpen(s) && (
                            <span className="card-badge badge-green">測試中，到 {taipeiHm(s.test_send_until!)}（台北）自動關閉；只寄給：{s.test_recipients.join("、")}</span>
                          )}
                          <textarea rows={2} value={testTo[s.id] ?? DEFAULT_TEST_TO} aria-label={`${s.email} 的測試收件人`}
                            onChange={(e) => setTestTo((t) => ({ ...t, [s.id]: e.target.value }))} />
                          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {([1, 8, 24] as const).map((h) => (
                              <button key={h} type="button" className="btn-primary" disabled={busy === s.id} onClick={() => void testSend(s.id, h)}>開 {h} 小時</button>
                            ))}
                            <button type="button" className="btn-secondary" disabled={busy === s.id || !testOpen(s)} onClick={() => void testSend(s.id, 0)}>關閉</button>
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {senders.length === 0 ? (
        <p className="card-sub">還沒有寄件信箱。連接 Gmail 後會自動出現在這裡。</p>
      ) : senders.map((s) => {
        const value = drafts[s.id] ?? "";
        const unsaved = !s.signature_block;
        return (
          <div key={s.id} className="card" style={{ display: "grid", gap: 6 }}>
            <span>
              <strong>{s.email}</strong>
              <span className="card-sub"> · {s.stream_type}</span>
              {unsaved && <span className="card-badge badge-gray" style={{ marginLeft: 8 }}>署名尚未儲存</span>}
            </span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="card-sub">
                回信同步：{s.last_sync_at ? `上次 ${new Date(s.last_sync_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}` : "還沒同步過"}
                {s.rescan_days ? `・補掃 ${s.rescan_days} 天排隊中` : ""}
              </span>
              {[1, 3, 7].map((d) => (
                <button key={d} type="button" className="btn-secondary" disabled={busy === s.id} onClick={() => void rescan(s.id, d)}>補掃 {d} 天</button>
              ))}
            </span>
            <textarea rows={4} value={value} aria-label={`${s.email} 的署名`}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))} />
            <button type="button" className="btn-primary" disabled={busy === s.id || !value.trim()} onClick={() => void save(s.id)}>
              {busy === s.id ? "儲存中…" : "儲存署名"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
