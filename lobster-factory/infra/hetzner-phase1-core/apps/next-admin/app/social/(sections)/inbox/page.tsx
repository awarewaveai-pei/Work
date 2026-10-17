import RoutePage from "../../../(shell)/tools/social/RoutePage";

export const metadata = { title: "訊息收件匣 · 社群發文" };

export default function Page() {
  return <RoutePage route={{ kind: "section", section: "inbox" }} />;
}
