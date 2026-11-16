// The video workbench's own pages served by next-admin (video-unify-plan-20261116 §4 U1): the shell frames them, so no
// door menu or sign-out foot; the door's access check still applies. (door) holds the pages the door itself frames.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../../ProductDoorShell";
import { WorkbenchRuntime } from "./workbench";

export default function VideoWorkbenchPagesLayout({ children }: { children: ReactNode }) {
  return (
    <ProductDoorShell productKey="video" bare>
      <WorkbenchRuntime />
      {children}
    </ProductDoorShell>
  );
}
