import { headers } from "next/headers";
import { productHost } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
import { doorAccess } from "@/lib/portal/door-access";
import ScheduleWorkbench from "./ScheduleWorkbench";

export const metadata = { title: "自動排程" };
export default async function SchedulePage() {
  const content = PRODUCTS.find((p) => p.key === "content" && p.door.app === "next-admin" && p.door.enabled !== false);
  const settingsHref = content && await doorAccess(await headers(), content.key) === "open" ? `https://${productHost(content)}/topics` : null;
  return <ScheduleWorkbench settingsHref={settingsHref} />;
}
