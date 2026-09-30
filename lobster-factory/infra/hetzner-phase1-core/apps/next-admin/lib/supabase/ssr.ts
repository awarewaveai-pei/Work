// Supabase Auth (SSR) client helpers — the identity layer for the admin console.
//
// Separate from lib/supabase-server.ts (which holds the anon/service-role *data* clients
// with persistSession:false). These are the *auth/session* clients built on @supabase/ssr:
//   - browser client  → the /login form (signInWithPassword, cookie-managed session)
//   - middleware client → middleware.ts session gate (reads cookies, validates getUser())
//
// Role/identity flows OUT of middleware as the existing `x-ops-claims-role` header, so every
// downstream RBAC consumer (lib/ops-role.ts) keeps working unchanged.

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_COOKIE_OPTIONS } from "./auth-cookie-options";

// Public anon key + URL are safe in the browser bundle (NEXT_PUBLIC_*, baked at build time).
// The session cookie — not the anon key — is what authenticates a user.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

/** True only when the auth layer is configured. Middleware fails CLOSED when this is false. */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Browser client for client components (the /login form). Manages the session via cookies. */
export function createSupabaseBrowserClient(): SupabaseClient {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
  });
}

export interface RefreshedCookie {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
}

/**
 * Middleware-scoped server client. Returns the Supabase client plus an array the caller must
 * apply (`response.cookies.set(...)`) onto whatever NextResponse it actually returns, so
 * rotated session tokens persist. Follows the official @supabase/ssr middleware pattern.
 *
 * Critic finding M-1 (2026-08-29, CONFIRMED via repro): this used to return a `response:
 * NextResponse` object built as `let response = NextResponse.next(...)` and REBOUND inside
 * `setAll()` when a token rotation happened. Because `setAll()` runs asynchronously (during the
 * caller's `await supabase.auth.getUser()`) and the caller destructures `response` at call time
 * -- BEFORE that await -- the caller's binding forever pointed at the original, pre-rotation
 * object. `setAll`'s reassignment only rebound ssr.ts's OWN local variable, invisible outside
 * this function. Every rotated cookie was silently dropped; a `get response()` accessor would
 * have the identical bug (a getter re-evaluated at destructure time, not at read time, has the
 * same staleness). A plain array has no such indirection: `setAll` pushes into it, the caller
 * reads it after the same await resolves, and the object identity that matters is the array's,
 * which never changes.
 */
export function createSupabaseMiddlewareClient(request: NextRequest): {
  supabase: SupabaseClient;
  refreshedCookies: RefreshedCookie[];
} {
  const refreshedCookies: RefreshedCookie[] = [];

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request (for any later read in this pass) and record for the caller
        // to apply onto whichever response it ends up building.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshedCookies.push(...cookiesToSet);
      },
    },
  });

  return { supabase, refreshedCookies };
}
