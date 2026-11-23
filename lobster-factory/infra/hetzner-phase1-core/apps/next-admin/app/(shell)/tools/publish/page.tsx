import PublishWizard from "./PublishWizard";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "一鍵上架" };

export default function PublishPage() {
  return (
    <>
      <h1 style={SR_ONLY}>一鍵上架</h1>
      <div className="topbar">
        <span className="topbar-title">上架 Publish（設計 → Woo 草稿 → Printful 綁定）</span>
      </div>
      <PublishWizard />
    </>
  );
}
