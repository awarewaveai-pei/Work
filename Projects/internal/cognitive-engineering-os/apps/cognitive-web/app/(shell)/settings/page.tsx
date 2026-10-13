import { cookies } from "next/headers";
import { SettingsPage } from "../../../components/blocks/SettingsPage";
import { THEME_COOKIE, themeOf } from "../../../lib/theme";

// 設定: colours, where you are, export, delete the account.
export default async function Page() {
  return <SettingsPage theme={themeOf((await cookies()).get(THEME_COOKIE)?.value) ?? null} />;
}
