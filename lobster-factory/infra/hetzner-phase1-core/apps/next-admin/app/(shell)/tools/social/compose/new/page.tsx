import RoutePage from "../../RoutePage";

export const metadata = { title: "建立貼文 · 社群發文 · Lobster Factory" };

export default function Page() {
  return <RoutePage route={{ kind: "compose", postId: null }} />;
}
