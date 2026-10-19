// /smartlink/<slug> for a page that is not published or does not exist (C26): the same words for both.
import { LinkPageClosed } from "../../../(shell)/tools/social/smartlinks/LinkPage";

export default function SmartLinkClosed() {
  return <main className="sl-screen"><LinkPageClosed /></main>;
}
