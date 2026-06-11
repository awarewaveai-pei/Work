import PublishWizard from "./PublishWizard";

export const metadata = { title: "上架 Publish · Lobster Factory" };

export default function PublishPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">上架 Publish（設計 → Woo 草稿 → Printful 綁定）</span>
      </div>
      <PublishWizard />
    </>
  );
}
