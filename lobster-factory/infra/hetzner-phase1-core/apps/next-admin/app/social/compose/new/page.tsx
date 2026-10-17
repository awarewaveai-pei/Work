import RoutePage from "../../../(shell)/tools/social/RoutePage";

export const metadata = { title: "建立貼文 · 社群發文" };

export default function Page() {
  return <RoutePage route={{ kind: "compose", postId: null }} />;
}
