import { Suspense } from "react";
import SocialApp from "./SocialApp";

export const metadata = { title: "社群發文 · Lobster Factory" };

export default function SocialPage() {
  return (
    <Suspense fallback={null}>
      <SocialApp />
    </Suspense>
  );
}
