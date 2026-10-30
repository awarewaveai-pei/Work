// portal.<base domain>/login/wp, rewritten by nginx to /portal/login/wp: the same one-time WordPress sign-in as every
// door's /login/wp (app/login/wp/page.tsx), for the member's workspace. Public via middleware.ts PORTAL_PUBLIC_PATHS.
export { default } from "@/app/login/wp/page";
export const dynamic = "force-dynamic";
