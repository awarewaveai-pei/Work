import ApiCheckClientPage from "./ApiCheckClientPageClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "API 健康（瀏覽器）" };

export default function Page() {
  return (
    <>
      <h1 style={SR_ONLY}>API 健康（瀏覽器）</h1>
      <ApiCheckClientPage />
    </>
  );
}
