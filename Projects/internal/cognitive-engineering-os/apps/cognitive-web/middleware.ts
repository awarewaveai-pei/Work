import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const open = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/help";   // help is never behind a login
  if (open || request.cookies.has("cognitive_os_session")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
