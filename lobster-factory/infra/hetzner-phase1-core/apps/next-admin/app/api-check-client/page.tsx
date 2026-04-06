"use client";

import { useEffect, useState } from "react";

const path = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api";

export default function ApiCheckClientPage() {
  const [body, setBody] = useState<string>("loading…");

  useEffect(() => {
    fetch(`${path}/health`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBody(JSON.stringify(j, null, 2)))
      .catch((e) => setBody(String(e)));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>API Check (browser)</h1>
      <p>
        Fetches same-origin <code>{path}/health</code> via Nginx.
      </p>
      <pre>{body}</pre>
    </main>
  );
}
