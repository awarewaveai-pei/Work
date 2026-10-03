import { HelpPage } from "../../../components/blocks/HelpPage";

// 求助與你的權利: open to anyone (middleware.ts lets /help through without a session).
export default function Page() {
  return <HelpPage />;
}
