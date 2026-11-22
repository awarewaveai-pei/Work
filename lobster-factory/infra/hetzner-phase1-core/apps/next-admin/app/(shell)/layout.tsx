import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PlatformFrame } from "../PlatformFrame";
import { UpdateNotice } from "../UpdateNotice";
import { CodexLaptopButton } from "../CodexLaptopButton";
import { OpsInboxBadge } from "./ops/inbox/components/OpsInboxBadge";
import { getThemeConfig } from "../../lib/theme/store";
import { currentBuildId } from "../../lib/build-id";
import { DEFAULT_SECTIONS } from "../sidebar-sections";
import { staffGrantOf, staffMayOpen, staffUnrestricted } from "../../lib/staff-access";
import { requestActor, resolveSubject } from "../../lib/entitlements/subject";
import { codexAllowed } from "../../lib/tarot/codex-bridge";

// The staff console's frame is app/PlatformFrame.tsx (one frame for the staff console and every product door, K5). The
// staff-only parts are worked out and built here, not in the frame: the frame is also every door's, and a door's import
// graph must not reach staff APIs or the service-role client (lib/portal/__tests__/registry-code.test.ts, staff-tools.test.ts).
/** The internal org's id (「AwareWave 自己」); null when it cannot be read (the client rail then has no self row). */
async function internalOrgId(): Promise<string | null> {
  try {
    return (await resolveSubject({})).orgId;
  } catch {
    return null;
  }
}

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { layout: navLayout } = await getThemeConfig();
  // Staff tool grants: a restricted staff member sees only the links of the tools ticked for them.
  const h = await headers();
  const grant = staffGrantOf(h);
  // Codex 免費生圖 is the owner's alone (codexAllowed), so only she gets the laptop button.
  const codexOwner = codexAllowed(requestActor(new Request("http://shell.local/", { headers: h })));
  const visible = staffUnrestricted(grant)
    ? null
    : DEFAULT_SECTIONS.flatMap(s => s.items).flatMap(i => (i.type === "link" && staffMayOpen(grant, i.href) ? [i.href] : []));

  return PlatformFrame({
    kind: "staff",
    navLayout,
    internalOrgId: await internalOrgId(),
    sitesPath: "/api/content/sites",
    visible,
    inboxBadge: <OpsInboxBadge />,
    footTop: codexOwner ? <CodexLaptopButton /> : null,
    notice: <UpdateNotice buildId={currentBuildId()} />,
    children,
  });
}
