import Link from "next/link";
import { headers } from "next/headers";
import { staffGrantOf, staffMayOpen, staffUnrestricted } from "@/lib/staff-access";

function getInternalApiBase(): string {
  const raw = process.env.INTERNAL_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "http://node-api:3001";
}

interface HealthResult {
  ok?: boolean;
  service?: string;
  port?: number;
  supabaseUrl?: string;
  openai?: string;
  error?: string;
}

const FETCH_TIMEOUT_MS = 6000;

async function fetchHealth(path: string): Promise<HealthResult> {
  const base = getInternalApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { error: `timeout (${FETCH_TIMEOUT_MS}ms)` };
    }
    return { error: e instanceof Error ? e.message : "unreachable" };
  }
}

export const dynamic = "force-dynamic";

type Card = { href: string; icon: string; iconClass: string; title: string; desc: string; external?: boolean };
// 建站三步序列與 SidebarNav 的 build-onboard 區一致（intake → 精靈 → 部署）；Repair & Control 與 repair-control 區一致。
const DASHBOARD_SECTIONS: Array<{ title: string; cards: Card[] }> = [
  { title: "Monitoring", cards: [
    { href: "/ops/inbox", icon: "📥", iconClass: "icon-ops", title: "Ops Inbox", desc: "Sentry · Uptime Kuma · Grafana 警報收件匣" },
    { href: "/ops/clients", icon: "👥", iconClass: "icon-ops", title: "Clients", desc: "全客戶健康狀態 + WordPress 外掛更新" },
    { href: "/api-check", icon: "⬡", iconClass: "icon-infra", title: "API Health", desc: "Node API 即時健康狀態" },
  ] },
  { title: "Repair & Control", cards: [
    { href: "/ops/repairs", icon: "🛠", iconClass: "icon-ops", title: "Repair Center", desc: "Auto-repair 控制面：incident → PR → deploy gate" },
    { href: "/ops/approvals", icon: "✓", iconClass: "icon-ops", title: "Pending Approvals", desc: "高風險指令等待簽核" },
    { href: "/ops/system-modes", icon: "◐", iconClass: "icon-ops", title: "System Modes", desc: "全域 Kill Switch · 維護模式切換" },
  ] },
  { title: "Build & Onboard", cards: [
    { href: "/ops/onboarding", icon: "✨", iconClass: "icon-prov", title: "Onboarding（客戶 Intake）", desc: "建站第 1 步：客戶探索式問卷" },
    { href: "/onboard", icon: "✦", iconClass: "icon-prov", title: "建站精靈（技術）", desc: "建站第 2 步：資訊 → 部門選型 → 服務開通 → Build" },
    { href: "/build", icon: "⚡", iconClass: "icon-prov", title: "Build Console", desc: "建站第 3 步：部署執行（plan_only 預覽或 enqueue 送 Trigger.dev）" },
  ] },
  { title: "External Services", cards: [
    { href: "https://n8n.aware-wave.com", icon: "⚙", iconClass: "icon-ext", title: "n8n Workflows", desc: "自動化工作流程引擎", external: true },
    { href: "https://uptime.aware-wave.com", icon: "◉", iconClass: "icon-ext", title: "Uptime Kuma", desc: "服務正常運行監控", external: true },
    { href: "https://trigger.aware-wave.com", icon: "▶", iconClass: "icon-ext", title: "Trigger.dev", desc: "背景任務與排程系統", external: true },
    { href: "https://aware-wave.com", icon: "◻", iconClass: "icon-ext", title: "WordPress", desc: "客戶主網站", external: true },
  ] },
];

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`card-badge ${ok ? "badge-green" : "badge-red"}`}>
      <span className={`dot ${ok ? "dot-green" : "dot-red"}`} />
      {ok ? "Online" : "Down"}
    </span>
  );
}

function NavCard({
  href,
  icon,
  iconClass,
  title,
  desc,
  external,
}: {
  href: string;
  icon: string;
  iconClass: string;
  title: string;
  desc: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className={`link-card-icon-wrap ${iconClass}`}>{icon}</span>
      <span className="link-card-body">
        <span className="link-card-title">{title}</span>
        <span className="link-card-sub">{desc}</span>
      </span>
      <span className="link-card-arrow">{external ? "↗" : "›"}</span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="link-card">
        {inner}
      </a>
    );
  }
  return <Link href={href} className="link-card">{inner}</Link>;
}

export default async function DashboardPage() {
  const [api, rag] = await Promise.all([
    fetchHealth("/health"),
    fetchHealth("/rag/health"),
  ]);

  const env = process.env.NODE_ENV ?? "unknown";
  const grant = staffGrantOf(await headers());
  const unrestricted = staffUnrestricted(grant);

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <span className="topbar-env">
          <span className={`dot ${env === "production" ? "dot-green" : "dot-yellow"}`} />
          {env}
        </span>
      </div>

      <div className="page">

        {/* ── System Status ───────────────────────────── */}
        <div className="card-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-label">node-api</span>
              <StatusBadge ok={!api.error && api.ok === true} />
            </div>
            <div className="card-value">
              {api.error ? "—" : `Port ${api.port ?? 3001}`}
            </div>
            <div className="card-sub">
              {api.error ? api.error : "Express API server"}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-label">RAG / Supabase</span>
              <StatusBadge ok={!rag.error && rag.ok === true} />
            </div>
            <div className="card-value">
              {rag.error ? "—" : (rag.supabaseUrl === "configured" ? "Connected" : "Missing")}
            </div>
            <div className="card-sub">
              {rag.error
                ? rag.error
                : `OpenAI: ${rag.openai ?? "—"} · Supabase: ${rag.supabaseUrl ?? "—"}`}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-label">next-admin</span>
              <span className="card-badge badge-green">
                <span className="dot dot-green" />
                Online
              </span>
            </div>
            <div className="card-value">Port 3002</div>
            <div className="card-sub">Next.js 15 · React 19</div>
          </div>
        </div>

        {/* Section titles mirror SidebarNav (repair-control, build-onboard). A restricted staff member sees only the
            cards of the tools ticked for them (lib/staff-access.ts); a section left empty is not drawn. */}
        {DASHBOARD_SECTIONS.map((sec) => ({ ...sec, cards: sec.cards.filter((c) => (c.external ? unrestricted : staffMayOpen(grant, c.href))) }))
          .filter((sec) => sec.cards.length > 0)
          .map((sec, i, all) => (
            <div key={sec.title}>
              <div className="section-title" style={i === 0 ? { marginTop: 8 } : undefined}>{sec.title}</div>
              <div className="link-list" style={i < all.length - 1 ? { marginBottom: 28 } : undefined}>
                {sec.cards.map((c) => <NavCard key={c.href} {...c} />)}
              </div>
            </div>
          ))}

      </div>
    </>
  );
}
