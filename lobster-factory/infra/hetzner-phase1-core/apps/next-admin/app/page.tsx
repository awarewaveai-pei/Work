export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Lobster Factory Admin</h1>
      <p>Next.js Admin is running.</p>
      <ul>
        <li>
          <a href="/api-check">API Check (server → node-api)</a>
        </li>
        <li>
          <a href="/api-check-client">API Check (browser → /api)</a>
        </li>
      </ul>
    </main>
  );
}
