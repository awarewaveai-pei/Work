"use client";
// Client hub → 冷開發: read-only state of this client's outreach (GET /api/ops/clients/[slug]/outreach-summary).
// The work itself happens in /tools/outreach?org=<id>; this tab only shows where it stands and links there.
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

type Block<T> = ({ ok: true } & T) | { ok: false; error: string };
type Sender = { id: string; email: string; send_mode: "draft" | "auto"; today_claims: number | null; cap: number | null; health_status: string; auto_draft: boolean; is_active: boolean };
type Summary = {
  organizationId: string;
  senders: Block<{ senders: Sender[] }>;
  counts: Block<{ inboxAwaiting: number; leads: number; messagesMonth: number; draftsMonth: number; sentMonth: number; repliesMonth: number; bouncesMonth: number }>;
  spend: Block<{ usd: number; twd: number; calls: number; free: number }>;
  features: Block<{ features: Array<{ key: string; name: string; allowed: boolean; reason: string | null }> }>;
};

const HEALTH: Record<string, string> = { healthy: "正常", warning: "注意", paused: "已暫停", blocked: "已封鎖" };
const th = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" } as const;
const td = { padding: "6px 10px", fontSize: 12, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" } as const;

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header"><span className="card-label">{title}</span></div>
      <p className="card-sub" style={{ marginBottom: 10 }}>{sub}</p>
      {children}
    </div>
  );
}

const Failed = () => <span className="card-badge badge-red">讀取失敗</span>;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: 120 }}>
      <div className="card-sub">{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{value.toLocaleString("en-US")}</div>
    </div>
  );
}

export function OutreachTab({ org }: { org: { slug: string; name: string } }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    fetch(`/api/ops/clients/${encodeURIComponent(org.slug)}/outreach-summary`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`讀取失敗 (${res.status})`);
        return (await res.json()) as Summary;
      })
      .then((json) => { if (live) setData(json); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "讀取失敗"); });
    return () => { live = false; };
  }, [org.slug]);

  if (error) return <Failed />;
  if (!data) return <p className="card-sub">載入中…</p>;
  const orgQuery = `?org=${data.organizationId}`;
  const shortcuts: Array<[string, string]> = [
    ["使用說明", "/tools/outreach/guide"],
    ["總覽", `/tools/outreach${orgQuery}`],
    ["名單收件匣", `/tools/outreach/inbox${orgQuery}`],
    ["名單", `/tools/outreach/leads${orgQuery}`],
    ["信件審核", `/tools/outreach/review${orgQuery}`],
    ["回信", `/tools/outreach/replies${orgQuery}`],
    ["連線與信箱", `/tools/outreach/connectors${orgQuery}`],
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <Section title="寄件信箱" sub={`${org.name} 用來寄開發信的信箱，和每天可寄的量。`}>
        {!data.senders.ok ? <Failed /> : data.senders.senders.length === 0 ? (
          <p className="card-sub">
            還沒有連上任何信箱。到 <Link href={`/tools/outreach/connectors${orgQuery}`}>連線與信箱</Link> 連上 Gmail 後才能出信。
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={th}>信箱</th><th style={th}>模式</th><th style={th}>今日已排寄／上限</th><th style={th}>狀態</th><th style={th}>自動建草稿</th><th style={th}>啟用</th>
            </tr></thead>
            <tbody>
              {data.senders.senders.map((s) => (
                <tr key={s.id}>
                  <td style={td}>{s.email}</td>
                  <td style={td}>{s.send_mode === "auto" ? "自動寄" : "草稿"}</td>
                  <td style={td}>{s.today_claims === null || s.cap === null ? "—" : `${s.today_claims}／${s.cap}`}</td>
                  <td style={td}><span className={`card-badge ${s.health_status === "healthy" ? "badge-green" : s.health_status === "warning" ? "badge-gray" : "badge-red"}`}>{HEALTH[s.health_status] ?? s.health_status}</span></td>
                  <td style={td}>{s.auto_draft ? "是" : "否"}</td>
                  <td style={td}>{s.is_active ? "是" : "否"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="名單與信件" sub="名單和信件目前累積的數量，信件與回信只算本月（台北時間）。">
        {!data.counts.ok ? <Failed /> : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <Stat label="收件匣待審" value={data.counts.inboxAwaiting} />
            <Stat label="名單總數" value={data.counts.leads} />
            <Stat label="本月產生信件" value={data.counts.messagesMonth} />
            <Stat label="其中 Gmail 草稿" value={data.counts.draftsMonth} />
            <Stat label="其中已寄出" value={data.counts.sentMonth} />
            <Stat label="本月回信" value={data.counts.repliesMonth} />
            <Stat label="本月退信" value={data.counts.bouncesMonth} />
          </div>
        )}
      </Section>

      <Section title="本月外聯花費" sub="這個客戶本月（台北時間）外聯用掉的 AI 與查詢費用。">
        {!data.spend.ok ? <Failed /> : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Stat label="呼叫次數" value={data.spend.calls} />
            <Stat label="其中免費" value={data.spend.free} />
            <div style={{ minWidth: 120 }}>
              <div className="card-sub">合計</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
                US${data.spend.usd.toFixed(4)} <span className="card-sub">（約 NT${Math.round(data.spend.twd).toLocaleString("en-US")}）</span>
              </div>
            </div>
            <Link className="btn btn-secondary" href="/ops/costs">看全部花費</Link>
          </div>
        )}
      </Section>

      <Section title="開通的功能" sub="這個客戶的方案或贈送內，外聯六項功能哪些能用。">
        {!data.features.ok ? (
          <>
            <Failed /> <Link className="btn btn-secondary" href="/ops/plans">到方案頁查看</Link>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.features.features.map((f) => (
              <span key={f.key} className={`card-badge ${f.allowed ? "badge-green" : "badge-gray"}`} title={f.reason ?? f.key}>
                {f.name}：{f.allowed ? "已開通" : "未開通"}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title="捷徑" sub="到冷開發工作台的各頁，已帶入這個客戶。">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {shortcuts.map(([label, href]) => <Link key={href} className="btn btn-secondary" href={href}>{label}</Link>)}
        </div>
      </Section>
    </div>
  );
}
