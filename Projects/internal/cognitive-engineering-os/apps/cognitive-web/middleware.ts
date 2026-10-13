import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const open = ["/login", "/help", "/invite"].includes(request.nextUrl.pathname);   // help is never behind a login; an invite makes the account
  if (open || request.cookies.has("cognitive_os_session")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
