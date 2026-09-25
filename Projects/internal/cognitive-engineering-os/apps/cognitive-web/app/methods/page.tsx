"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import React from "react";
import { apiFetch } from "../../lib/api";

type Method = { method_id: string; status: string; display?: { name_zh?: string; blurb_zh?: string } };
export default function MethodsPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [query, setQuery] = useState("");
  const [problem, setProblem] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<Method[]>("/methods").then(setMethods).catch((reason) => setError(String(reason))); }, []);
  const active = methods.filter((method) => method.status === "ACTIVE");
  const filtered = active.filter((method) => `${method.method_id} ${method.display?.name_zh ?? ""} ${method.display?.blurb_zh ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const terms = problem.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const suggestions = active.map((method) => ({ method, score: terms.reduce((score, term) => score + (`${method.display?.name_zh ?? ""} ${method.display?.blurb_zh ?? ""}`.toLowerCase().includes(term) ? 1 : 0), 0) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return <div>
    <header className="card"><h1>思考工具</h1><p>描述問題，挑一個工具開始。</p><input aria-label="搜尋工具" placeholder="搜尋工具" value={query} onChange={(event) => setQuery(event.target.value)} /></header>
    <section className="card"><h2>不知道用哪個？說你卡在哪</h2><p>寫下眼前的問題；先用工具說明比對最多三個候選。</p><textarea aria-label="描述你的問題" value={problem} onChange={(event) => setProblem(event.target.value)} /><button type="button" onClick={() => setShowSuggestions(true)}>找適合的工具</button>{showSuggestions && <div>{suggestions.length ? suggestions.map(({ method }) => <p key={method.method_id}><Link href={`/methods/${encodeURIComponent(method.method_id)}`}>{method.display?.name_zh ?? method.method_id}</Link> — {method.display?.blurb_zh}</p>) : <p>目前沒有文字相符的工具；可改用下方搜尋或瀏覽清單。</p>}</div>}</section>
    {error && <p className="error">{error}</p>}
    <div className="grid">{filtered.map((method) => <article className="card" key={method.method_id}><h2>{method.display?.name_zh ?? method.method_id}</h2><p className="muted">{method.method_id}</p><p>{method.display?.blurb_zh}</p><Link href={`/methods/${encodeURIComponent(method.method_id)}`}>開始使用</Link></article>)}</div>
  </div>;
}
