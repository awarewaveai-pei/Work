import { Suspense } from "react";
import SocialApp from "../(shell)/tools/social/SocialApp";

export const metadata = { title: "社群發文" };

// social.<base domain>/ -> /social (middleware.ts); the same app staff open at /tools/social.
export default function SocialDoorPage() {
  return (
    <Suspense fallback={null}>
      <SocialApp />
    </Suspense>
  );
}
