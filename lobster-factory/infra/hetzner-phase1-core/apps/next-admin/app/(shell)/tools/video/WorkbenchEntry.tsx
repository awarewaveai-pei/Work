import { productHost } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
import OpenWorkbench from "./OpenWorkbench";

/** The staff page for the video product: one button that opens the workbench (open = one of its pages, e.g. script-forge). */
export default function WorkbenchEntry({ open }: { open: string | null }) {
  const video = PRODUCTS.find((p) => p.key === "video")!;
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">影音工作台</span>
        <span className="topbar-env">腳本 → 做片 → 審片 → 發布</span>
      </div>
      <OpenWorkbench videoHost={productHost(video)} open={open} />
    </>
  );
}
