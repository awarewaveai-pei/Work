import BannerStudioStaff from "./BannerStudioStaff";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "橫幅 · Lobster Factory" };

// The visible page title bar was removed (R3-B: no room); the page name stays for screen readers and the page-name check.
export default function BannerPage() {
  return (
    <>
      <h1 style={SR_ONLY}>橫幅</h1>
      <BannerStudioStaff />
    </>
  );
}
