import StudioWorkbench from "../(shell)/tools/studio/StudioWorkbench";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "設計工作台" };

// studio.<base domain>/ -> /studio (middleware.ts); the same workbench staff open at /tools/studio.
export default function StudioDoorPage() {
  return <><h1 style={SR_ONLY}>設計工作台</h1><StudioWorkbench /></>;
}
