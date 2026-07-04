export function RawPayloadDetails({ raw }: { raw: Record<string, unknown> }) {
  return (
    <details style={{ marginTop: 16, background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
      <summary>Raw payload</summary>
      <pre style={{ fontSize: 12, marginTop: 8, overflow: "auto", maxHeight: 400 }}>{JSON.stringify(raw, null, 2)}</pre>
    </details>
  );
}
