import TarotStudio from "../(shell)/tools/tarot/TarotStudio";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "塔羅工作台" };

// tarot.<base domain>/ -> /tarot (middleware.ts); the same studio staff open at /tools/tarot.
export default function TarotDoorPage() {
  return <><h1 style={SR_ONLY}>塔羅工作台</h1><TarotStudio /></>;
}
