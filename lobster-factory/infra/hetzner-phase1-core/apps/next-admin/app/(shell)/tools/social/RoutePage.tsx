import { Suspense } from "react";
import type { SocialRoute } from "./routes";
import SocialApp from "./SocialApp";

/** One screen of the social manager on its route (C19); the staff pages here and the door's pages under app/social. */
export default function RoutePage({ route }: { route: SocialRoute }) {
  return (
    <Suspense fallback={null}>
      <SocialApp route={route} />
    </Suspense>
  );
}
