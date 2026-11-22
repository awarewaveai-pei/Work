// 點數與合約 (blueprint §15.4, U10): reached as portal.aware-wave.com/wallet (nginx rewrite, as /launcher). Data is only
// GET /portal/api/account. The top-up link is computed here from config (lib/portal/hosts) and drawn only when
// canTopUp (aware-wave.com's seller_sites row is active).
import { shopUrl } from "@/lib/portal/hosts";
import { canTopUp } from "@/lib/portal/can-top-up";
import { WalletView } from "./WalletView";

export const dynamic = "force-dynamic";

export default async function PortalWalletPage() {
  return <WalletView topUpUrl={shopUrl()} canTopUp={await canTopUp()} />;
}
