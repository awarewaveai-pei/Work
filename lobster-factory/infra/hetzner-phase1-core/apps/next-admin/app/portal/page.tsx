import { redirect } from "next/navigation";

// Critic finding (Minor, 2026-08-29): with no page here, portal.aware-wave.com/ (-> /portal/
// after nginx's rewrite) 404'd -- the domain root was dead. /launcher is gated by middleware.ts
// same as any other authenticated portal page, so an unauthenticated visitor lands on /login
// anyway; this is just the entry point.
export default function PortalRootPage() {
  redirect("/launcher");
}
