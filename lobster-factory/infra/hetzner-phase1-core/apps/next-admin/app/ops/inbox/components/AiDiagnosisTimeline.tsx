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
            <div style={{ color: "var(--text-secondary)" }}>{d.summary}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
