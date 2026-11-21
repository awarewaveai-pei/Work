// Who may see and change /ops/systems: owner or admin, judged like /ops/system-modes (lib/ops-role readOpsRole on the
// request headers middleware set). Server code only; the tables are service-role only (migration 0174).
import { readOpsRole } from "@/lib/ops-role";
import type { OpsRole } from "@/lib/ops-contracts";

export function canUseSystems(role: OpsRole): boolean {
  return role === "owner" || role === "admin";
}

export function systemsAccess(h: Headers): { role: OpsRole; allowed: boolean; req: Request } {
  const req = new Request("http://localhost", { headers: h });
  const role = readOpsRole(req);
  return { role, allowed: canUseSystems(role), req };
}
