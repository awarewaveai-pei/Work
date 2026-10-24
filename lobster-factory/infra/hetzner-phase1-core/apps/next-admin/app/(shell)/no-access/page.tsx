// Where middleware sends a staff member who opens a tool not ticked for them (STAFF_TOOLS_MODE=enforce; lib/staff-access.ts).
import Link from "next/link";
import { STAFF_TOOLS } from "@/lib/portal/staff-tools";

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ tool?: string }> }) {
  const { tool } = await searchParams;
  const name = STAFF_TOOLS.find((t) => t.key === tool)?.name;
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">沒有權限</span>
      </div>
      <div className="page">
        <div className="card" style={{ maxWidth: 560 }}>
          <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>
            {name ? `你還不能使用「${name}」。` : "你還不能使用這個頁面。"}
          </p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            請找擁有者到「員工權限」頁替你勾選這個工具。勾選後約 15 秒生效，重新整理即可。
          </p>
          <Link href="/" className="link-card" style={{ display: "inline-flex" }}>回首頁</Link>
        </div>
      </div>
    </>
  );
}
