import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Lobster Factory Admin</h1>
      <p>Next.js Admin is running.</p>
      <ul>
        <li>
          <Link href="/api-check">API Check (server → node-api)</Link>
        </li>
        <li>
          <Link href="/api-check-client">API Check (browser → /api)</Link>
        </li>
      </ul>
    </main>
  );
}
