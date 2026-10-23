import TarotStudio from "../(shell)/tools/tarot/TarotStudio";

export const metadata = { title: "塔羅製圖" };

// tarot.<base domain>/ -> /tarot (middleware.ts); the same studio staff open at /tools/tarot.
export default function TarotDoorPage() {
  return <TarotStudio />;
}
