import { NextResponse, type NextRequest } from "next/server";
import { knownAddress } from "./lib/known-address";

export async function middleware(request: NextRequest) {
  const open = ["/login", "/help", "/invite"].includes(request.nextUrl.pathname);   // help is never behind a login; an invite makes the account
  if (!open && !request.cookies.has("cognitive_os_session")) return NextResponse.redirect(new URL("/login", request.url));
  // An address naming nothing is a 404 page load, decided here because (shell)/loading.tsx streams the page with 200 before
  // its notFound() runs (lib/known-address.ts). Same address, status set: the page still renders its own not-found content.
  // Page loads only (GET/HEAD): not a form post, nor the router's own requests (RSC header: a link press, a prefetch), whose
  // answer is data -- a non-200 one makes the client reload the whole page instead.
  if (open || !["GET", "HEAD"].includes(request.method) || request.headers.has("rsc")) return NextResponse.next();
  const known = await knownAddress(request.nextUrl.pathname, request.headers.get("cookie") ?? "");
  return known === false ? NextResponse.rewrite(request.nextUrl, { status: 404 }) : NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
