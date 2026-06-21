// /ops/clients — landing page; layout.tsx provides the client panel nav on the left.
// This page is shown when no client is selected yet.

export const dynamic = "force-dynamic";

export default function ClientsPage() {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", minHeight: "60vh",
      color: "var(--text-muted)", fontSize: 13, gap: 8,
    }}>
      <span style={{ fontSize: 28 }}>←</span>
      <span>從左側選擇客戶</span>
    </div>
  );
}
