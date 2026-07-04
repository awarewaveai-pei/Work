"use client";

import { useState, useTransition } from "react";

export function PasteAiResultBox({ incidentId }: { incidentId: string }) {
  const [text, setText] = useState("");
  const [provider, setProvider] = useState("other");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  const submit = () => {
    start(async () => {
      const r = await fetch("/api/ai/save-diagnosis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId, summary: text, provider }),
      });
      setMsg(r.ok ? "Saved." : `Save failed (${r.status})`);
      if (r.ok) setText("");
    });
  };

  return (
    <section style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)", marginTop: 16 }}>
      <h3>Paste AI conclusion</h3>
      <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ marginTop: 8, marginBottom: 8 }}>
        <option value="chatgpt">ChatGPT</option>
        <option value="claude">Claude</option>
        <option value="gemini">Gemini</option>
        <option value="other">Other</option>
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste diagnosis / RCA / next steps..."
        style={{ width: "100%", minHeight: 120, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button disabled={pending || !text.trim()} onClick={submit}>
          Save diagnosis
        </button>
        {msg && <span style={{ color: "var(--text-muted)" }}>{msg}</span>}
      </div>
    </section>
  );
}
