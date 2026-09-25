"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Method = { id: string; title?: string; description?: string; family?: string };
export default function MethodsPage() {
  const [methods, setMethods] = useState<Method[]>([]); const [query, setQuery] = useState(""); const [error, setError] = useState("");
  useEffect(() => { apiFetch<Method[]>("/methods").then(setMethods).catch((reason) => setError(String(reason))); }, []);
  const filtered = methods.filter((method) => `${method.id} ${method.title ?? ""} ${method.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div><header className="card"><h1>Cognitive OS</h1><p>描述問題，挑一個工具開始。</p><input placeholder="搜尋工具" value={query} onChange={(event) => setQuery(event.target.value)} /></header>{error && <p className="error">{error}</p>}<div className="grid">{filtered.map((method) => <article className="card" key={method.id}><h2>{method.title ?? method.id}</h2><p className="muted">{method.id}</p><p>{method.description}</p><Link href={`/methods/${encodeURIComponent(method.id)}`}>開始使用</Link></article>)}</div></div>;
}
