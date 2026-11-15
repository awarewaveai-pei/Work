import type { ReactNode } from "react";
import { headers } from "next/headers";
import { LogoutButton } from "../LogoutButton";
import { SidebarNav } from "../SidebarNav";
import { UpdateNotice } from "../UpdateNotice";
import { getThemeConfig } from "../../lib/theme/store";
import { currentBuildId } from "../../lib/build-id";
import { DEFAULT_SECTIONS } from "../sidebar-sections";
import { staffGrantOf, staffMayOpen, staffUnrestricted } from "../../lib/staff-access";
import { CodexLaptopButton } from "../CodexLaptopButton";
import { requestActor } from "../../lib/entitlements/subject";
import { codexAllowed } from "../../lib/tarot/codex-bridge";

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

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">L</div>
          <div>
            <div className="sidebar-logo-text">Lobster Factory</div>
            <div className="sidebar-logo-sub">Admin Console</div>
          </div>
        </div>

        <SidebarNav initialLayout={navLayout} visible={visible} />

        {/* Wrapper takes the footer's margin-top:auto so the button sits right above it, not mid-sidebar. */}
        <div style={{ marginTop: "auto" }}>
          {codexOwner && <CodexLaptopButton />}
          <div className="sidebar-footer">
            aware-wave.com
            <LogoutButton />
          </div>
        </div>
      </nav>

      <div className="main">
        <UpdateNotice buildId={currentBuildId()} />
        {children}
      </div>
    </div>
  );
}
