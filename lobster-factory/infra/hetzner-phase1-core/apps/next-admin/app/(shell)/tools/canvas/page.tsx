import CanvasPage from "./ToolsCanvasPageClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "畫布編輯器" };

export default function Page() {
  return (
    <>
      <h1 style={SR_ONLY}>畫布編輯器</h1>
      <CanvasPage />
    </>
  );
}
