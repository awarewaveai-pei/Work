import type { ReactNode } from "react";
import { LogoutButton } from "../LogoutButton";
import { SidebarNav } from "../SidebarNav";
import { UpdateNotice } from "../UpdateNotice";
import { getThemeConfig } from "../../lib/theme/store";
import { currentBuildId } from "../../lib/build-id";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { layout: navLayout } = await getThemeConfig();

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

        <SidebarNav initialLayout={navLayout} />

        <div className="sidebar-footer">
          aware-wave.com
          <LogoutButton />
        </div>
      </nav>

      <div className="main">
        <UpdateNotice buildId={currentBuildId()} />
        {children}
      </div>
    </div>
  );
}
