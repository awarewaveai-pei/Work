async function getHealth() {
  const base =
    (process.env.INTERNAL_API_BASE_URL ?? "http://node-api:3001").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unreachable" };
  }
}

export default async function ApiCheckPage() {
  const health = await getHealth();
  const ok = !health.error && health.ok === true;

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">API Health — Server</span>
        <span className={`card-badge ${ok ? "badge-green" : "badge-red"}`}>
          <span className={`dot ${ok ? "dot-green" : "dot-red"}`} />
          {ok ? "Online" : "Down"}
        </span>
      </div>

      <div className="page">
        <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 13 }}>
          Server-side fetch via <code>INTERNAL_API_BASE_URL</code> (Docker hostname <code>node-api:3001</code>).
        </p>
        <pre>{JSON.stringify(health, null, 2)}</pre>
      </div>
    </>
  );
}
