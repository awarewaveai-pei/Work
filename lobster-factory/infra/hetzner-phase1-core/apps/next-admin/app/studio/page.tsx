import StudioWorkbench from "../(shell)/tools/studio/StudioWorkbench";

export const metadata = { title: "商品設計工作室" };

// studio.<base domain>/ -> /studio (middleware.ts); the same workbench staff open at /tools/studio.
export default function StudioDoorPage() {
  return <StudioWorkbench />;
}
