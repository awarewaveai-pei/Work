// /ops/staff -- staff roles and ticked tools (agency-os/handoffs/2026-10-24-staff-tool-grants C4). Data and rules:
// app/api/ops/staff/route.ts.
import { StaffAccess } from "./StaffAccess";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "員工權限" };

export const dynamic = "force-dynamic";

export default function StaffPage() {
  return (
    <>
      <h1 style={SR_ONLY}>員工權限</h1>
      <div className="topbar">
        <span className="topbar-title">員工權限</span>
      </div>
      <div className="page" style={{ maxWidth: 960 }}>
        <StaffAccess />
      </div>
    </>
  );
}
