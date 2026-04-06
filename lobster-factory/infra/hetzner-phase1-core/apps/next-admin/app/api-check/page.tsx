async function getHealth() {
  const base =
    process.env.INTERNAL_API_BASE_URL?.replace(/\/$/, "") ||
    "http://node-api:3001";
  const res = await fetch(`${base}/health`, { cache: "no-store" });
  if (!res.ok) {
    return { error: `HTTP ${res.status}` };
  }
  return res.json();
}

export default async function ApiCheckPage() {
  const health = await getHealth();

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>API Check (server-side)</h1>
      <p>Uses INTERNAL_API_BASE_URL inside Docker (hostname node-api).</p>
      <pre>{JSON.stringify(health, null, 2)}</pre>
    </main>
  );
}
