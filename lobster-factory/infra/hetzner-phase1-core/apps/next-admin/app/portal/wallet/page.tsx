// 點數與合約 (blueprint §15.4, U10): reached as portal.aware-wave.com/wallet (nginx rewrite, as /launcher). Data is only
// GET /portal/api/account; the top-up link is computed here from config (lib/portal/hosts), never written out in the browser code.
import { shopUrl } from "@/lib/portal/hosts";
import { WalletView } from "./WalletView";

export const dynamic = "force-dynamic";

export default function PortalWalletPage() {
  return <WalletView topUpUrl={shopUrl()} />;
}
