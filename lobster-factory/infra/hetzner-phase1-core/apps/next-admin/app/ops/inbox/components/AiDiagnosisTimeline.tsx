import type { Incident } from "@/lib/ops-inbox/types";

export function AiDiagnosisTimeline({ diagnoses }: { diagnoses: Incident["ai_diagnoses"] }) {
  if (!diagnoses?.length) return null;
  return (
    <section style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)", marginTop: 16 }}>
      <h3>AI diagnosis timeline</h3>
      <ul style={{ marginTop: 8, paddingLeft: 16 }}>
        {diagnoses.map((d, idx) => (
          <li key={`${d.created_at}-${idx}`} style={{ marginBottom: 8 }}>
            <strong>{d.provider}</strong> · {d.role} · {new Date(d.created_at).toLocaleString()}
            {d.role === "evidence" ? (
              // The evidence bundle can be ~6000 chars — collapse it so the
              // timeline stays readable; the full text is available on expand.
              <details style={{ color: "var(--text-secondary)", marginTop: 2 }}>
                <summary style={{ cursor: "pointer" }}>系統自動蒐證（點開查看）</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 4 }}>{d.summary}</pre>
              </details>
            ) : (
              <div style={{ color: "var(--text-secondary)" }}>{d.summary}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
