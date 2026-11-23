import MockupWithCatalog from "../../(shell)/tools/mockup/MockupWithCatalog";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "模型圖" };

// design.<base domain>/mockup: the same mockup studio and Printful catalog as /tools/mockup.
export default function DesignMockupPage() {
  return <><h1 style={SR_ONLY}>模型圖</h1><MockupWithCatalog /></>;
}
