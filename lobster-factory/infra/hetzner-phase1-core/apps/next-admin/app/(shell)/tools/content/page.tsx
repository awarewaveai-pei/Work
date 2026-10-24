import { Suspense } from "react";
import ContentStudioStaff from "./ContentStudioStaff";

export const metadata = { title: "SEO Content Studio · Lobster Factory" };

export default function ContentPage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">SEO Content Studio</span>
        <span className="topbar-env">AI-powered · publishes to WordPress draft</span>
      </div>
      <Suspense fallback={null}>
        <ContentStudioStaff />
      </Suspense>
    </>
  );
}
