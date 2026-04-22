import Link from "next/link";

interface HealthResult {
  ok?: boolean;
  service?: string;
  port?: number;
  supabaseUrl?: string;
  openai?: string;
  error?: string;
}

async function fetchHealth(path: string): Promise<HealthResult> {
  const base =
    (process.env.INTERNAL_API_BASE_URL ?? "http://node-api:3001").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unreachable" };
  }
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`card-badge ${ok ? "badge-green" : "badge-red"}`}>
      <span className={`dot ${ok ? "dot-green" : "dot-red"}`} />
      {ok ? "Online" : "Down"}
    </span>
  );
}

export default async function DashboardPage() {
  const [api, rag] = await Promise.all([
    fetchHealth("/health"),
    fetchHealth("/rag/health"),
  ]);

  const env = process.env.NODE_ENV ?? "unknown";

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

        <div className="section-title" style={{ marginTop: 8 }}>Quick Links</div>
        <div className="link-list">
          <Link href="/api-check" className="link-card">
            <span>⬡ API Health (server)</span>
            <span className="link-card-arrow">›</span>
          </Link>
          <Link href="/api-check-client" className="link-card">
            <span>⬡ API Health (browser)</span>
            <span className="link-card-arrow">›</span>
          </Link>
          <a href="https://n8n.aware-wave.com" target="_blank" rel="noreferrer" className="link-card">
            <span>⚙ n8n Workflows</span>
            <span className="link-card-arrow">↗</span>
          </a>
          <a href="https://uptime.aware-wave.com" target="_blank" rel="noreferrer" className="link-card">
            <span>◉ Uptime Kuma</span>
            <span className="link-card-arrow">↗</span>
          </a>
          <a href="https://trigger.aware-wave.com" target="_blank" rel="noreferrer" className="link-card">
            <span>▶ Trigger.dev</span>
            <span className="link-card-arrow">↗</span>
          </a>
          <a href="https://aware-wave.com" target="_blank" rel="noreferrer" className="link-card">
            <span>◻ WordPress Site</span>
            <span className="link-card-arrow">↗</span>
          </a>
        </div>
      </div>
    </>
  );
}
