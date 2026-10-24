// /ops/staff -- staff roles and ticked tools (agency-os/handoffs/2026-10-24-staff-tool-grants C4). Data and rules:
// app/api/ops/staff/route.ts.
import { StaffAccess } from "./StaffAccess";

export const dynamic = "force-dynamic";

export default function StaffPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">員工權限</span>
      </div>
      <div className="page" style={{ maxWidth: 960 }}>
        <StaffAccess />
      </div>
    </>
  );
}
