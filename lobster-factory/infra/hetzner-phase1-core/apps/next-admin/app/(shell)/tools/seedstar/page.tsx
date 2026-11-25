import Link from "next/link";
import AwareWaveThemeFrame from "@/components/tools/AwareWaveThemeFrame";

export default function SeedStarPage() {
  const url = new URL(process.env.AWAREWAVE_SEEDSTAR_URL || "http://127.0.0.1:4178");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.username || url.password)
    throw new Error("AWAREWAVE_SEEDSTAR_URL must be an HTTP loopback URL");
  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: "var(--font-size-xl)", color: "var(--text-primary)" }}>影片工作台</h1>
        <Link className="btn-secondary" href="/tools/theme">外觀管理</Link>
      </div>
      <AwareWaveThemeFrame src={url.href} title="影片工作台" />
    </div>
  );
}
