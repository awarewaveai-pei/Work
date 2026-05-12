import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

const PIPELINE = [
  {
    step: "1. Detect",
    owner: "Ops Inbox",
    detail: "Sentry / Uptime Kuma / Grafana / Netdata / PostHog 先進 Ops Inbox，做 fingerprint、severity、throttle、reopen 判斷。",
  },
  {
    step: "2. Triage",
    owner: "Repair Center",
    detail: "把『值得修』的 incident 轉成 repair candidate，決定是 code fix、analysis-only、還是 human-only。",
  },
  {
    step: "3. Approve",
    owner: "Slack / owner",
    detail: "只有 owner 明確批准後，才允許建立 repair run、pre-repair backup、GitHub issue 或 PR。",
  },
  {
    step: "4. Repair",
    owner: "Claude / GitHub",
    detail: "Claude Code 只負責 issue -> branch -> PR，不碰 production deploy，不改 secrets，不直接 SSH 改線上。",
  },
  {
    step: "5. Release",
    owner: "Build Console / sg-deploy.sh",
    detail: "Merge 後仍由人工觸發 deploy；health check 失敗就 rollback，並回報到 #ops-incidents 與 Telegram。",
  },
];

const STATES = [
  ["detected", "Webhook 已寫入 Ops Inbox，但尚未決定是否進 repair。"],
  ["triage_needed", "需要人看一眼，判斷是否適合進自動維修。"],
  ["approved", "操作者已批准，可建立 repair run。"],
  ["backing_up", "進行 pre-repair backup；失敗即整體停止。"],
  ["repairing", "GitHub issue / Claude analysis / PR 建立中。"],
  ["pr_ready", "PR 與摘要已就緒，等待人類 merge。"],
  ["deploy_pending", "PR merged，但尚未 deploy。"],
  ["deploying", "人工觸發 sg-deploy.sh，等待 health gate。"],
  ["rolled_back", "deploy 失敗，已自動 rollback。"],
  ["resolved", "問題已處理完成。"],
  ["human_only", "此事件不進 auto-repair，只保留分析或人工處理。"],
];

const INVARIANTS = [
  "Repair Center 不是第二個監控收件匣；收件匣永遠是 Ops Inbox。",
  "Repair Center 不是第二個簽核系統；高風險系統指令簽核仍走 Approvals / System Modes。",
  "Repair Center 不是 deploy 引擎；production deploy 仍走 sg-deploy.sh / Build Console。",
  "Telegram 永遠只是手機備援與 command plane，不是主 incident brain。",
  "沒有 backup，就沒有 repair run；沒有人工 merge / deploy，就沒有 production 變更。",
];

const DATA_PLANES = [
  {
    name: "Incident Plane",
    source: "ops_incidents",
    purpose: "唯一事件來源。Repair 只讀它，不重建第二套 incident table。",
    link: "/ops/inbox",
    linkLabel: "Open Ops Inbox",
  },
  {
    name: "Approval Plane",
    source: "Slack approve + /ops/approvals",
    purpose: "人類批准與高風險指令簽核維持分層，不混 audit trail。",
    link: "/ops/approvals",
    linkLabel: "Open Approvals",
  },
  {
    name: "Control Plane",
    source: "/ops/system-modes",
    purpose: "kill switch / maintenance / read-only 模式決定 repair 系統是否允許繼續。",
    link: "/ops/system-modes",
    linkLabel: "Open System Modes",
  },
  {
    name: "Release Plane",
    source: "Build Console + sg-deploy.sh",
    purpose: "所有 production 變更都要經過既有部署與 rollback gate。",
    link: "/build",
    linkLabel: "Open Build Console",
  },
];

export default function RepairsPage() {
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <nav style={{ marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>Dashboard</Link>
          {" / "}
          <span>Repair Center</span>
        </nav>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 24, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 750, color: "var(--text-primary)", marginBottom: 6 }}>Repair Center</h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 760, lineHeight: 1.7 }}>
              `app.aware-wave.com` 內 auto-repair 系統的唯一 orchestration layer。
              它不取代 Ops Inbox、Approvals、System Modes、Build Console，而是把它們串成
              一條可審核、可回滾、可長期擴充的 repair pipeline。
            </p>
          </div>
          <div style={{ display: "grid", gap: 8, minWidth: 260 }}>
            <QuickLink href="/ops/inbox" label="📥 Incident intake 來自 Ops Inbox" />
            <QuickLink href="/ops/approvals" label="✓ 高風險簽核仍在 Approvals" />
            <QuickLink href="/ops/system-modes" label="◐ Kill switch 仍由 System Modes 控制" />
            <QuickLink href="/build" label="⚡ Release 仍由 Build Console / sg-deploy" />
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 16, marginBottom: 16 }}>
          <Panel title="Why It Lives Here" subtitle="最適合掛在 /ops 之下的原因">
            <ul style={listStyle}>
              <li>它服務的是既有 Ops 流程，不是新產品模組，所以必須跟 `Ops Inbox` 同層。</li>
              <li>它的輸入是 incident、輸出是 PR / deploy decision，不是 raw monitor 或 content tool。</li>
              <li>它需要看見 kill switch、approvals、build gate，因此應該站在 `Actions` 區，不應藏到 `ops-console` 或 `build` 裡。</li>
            </ul>
          </Panel>

          <Panel title="Non-Negotiables" subtitle="這些邊界不能破">
            <ul style={listStyle}>
              {INVARIANTS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Panel>
        </div>

        <Panel title="Canonical Pipeline" subtitle="唯一正確的邏輯順序" style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            {PIPELINE.map((item) => (
              <div key={item.step} style={rowCardStyle}>
                <div style={{ minWidth: 120, fontWeight: 700, color: "var(--text-primary)" }}>{item.step}</div>
                <div style={{ minWidth: 120, fontSize: 12, color: "var(--accent)" }}>{item.owner}</div>
                <div style={{ color: "var(--text-secondary)", lineHeight: 1.65 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Panel title="Repair Run State Machine" subtitle="未來 repair_runs table 應遵守的狀態集合">
            <div style={{ display: "grid", gap: 8 }}>
              {STATES.map(([name, desc]) => (
                <div key={name} style={stateRowStyle}>
                  <code style={stateCodeStyle}>{name}</code>
                  <span style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="System Fit" subtitle="和既有 app.aware-wave.com 模組的邊界">
            <div style={{ display: "grid", gap: 10 }}>
              {DATA_PLANES.map((plane) => (
                <div key={plane.name} style={rowCardStyle}>
                  <div style={{ minWidth: 128 }}>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{plane.name}</div>
                    <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{plane.source}</code>
                  </div>
                  <div style={{ flex: 1, color: "var(--text-secondary)", lineHeight: 1.6 }}>{plane.purpose}</div>
                  <Link href={plane.link} style={jumpLinkStyle}>{plane.linkLabel}</Link>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Implementation Shape" subtitle="真正動工時，Repair Center 應該長成哪些子面板">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <MiniCard
              title="Queue"
              body="顯示 ready-for-repair incidents：來源、severity、service、fingerprint、last seen、推薦動作。"
            />
            <MiniCard
              title="Runs"
              body="追蹤每次 repair run：approved、backing_up、repairing、pr_ready、deploying、rolled_back。"
            />
            <MiniCard
              title="Safety"
              body="清楚顯示目前 kill switch、backup gate、health gate、rollback gate 是否允許繼續。"
            />
            <MiniCard
              title="Links"
              body="每筆 run 直接連到 Ops Inbox incident、GitHub issue、PR、deploy log、backup proof。"
            />
            <MiniCard
              title="Policies"
              body="哪些 source 可以 auto-repair，哪些只能 analysis-only，哪些一定 human-only。"
            />
            <MiniCard
              title="Audit"
              body="保留『誰批准、何時 merge、何時 deploy、是否 rollback』，但不複製既有 command audit。"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ ...panelStyle, ...style }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{title}</h2>
        {subtitle ? <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid var(--border-subtle)",
        textDecoration: "none",
        color: "var(--text-primary)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </Link>
  );
}

function MiniCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={miniCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>{body}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 12,
  padding: 18,
  boxShadow: "var(--shadow)",
};

const rowCardStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: "12px 14px",
  borderRadius: 10,
  background: "var(--bg-subtle)",
  border: "1px solid var(--border-subtle)",
};

const stateRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "132px 1fr",
  gap: 10,
  alignItems: "start",
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--bg-subtle)",
  border: "1px solid var(--border-subtle)",
};

const stateCodeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#4338ca",
  fontSize: 12,
  fontWeight: 700,
  width: "fit-content",
};

const miniCardStyle: CSSProperties = {
  background: "var(--bg-subtle)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 10,
  padding: 14,
  minHeight: 116,
};

const jumpLinkStyle: CSSProperties = {
  whiteSpace: "nowrap",
  textDecoration: "none",
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  paddingLeft: 18,
  color: "var(--text-secondary)",
  lineHeight: 1.8,
  display: "grid",
  gap: 6,
};
