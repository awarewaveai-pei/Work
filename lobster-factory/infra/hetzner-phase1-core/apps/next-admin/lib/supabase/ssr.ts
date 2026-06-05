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
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Middleware-scoped server client. Returns the Supabase client plus the NextResponse that
 * carries any refreshed-session cookies — the caller MUST return (or copy headers from)
 * `response` so rotated tokens persist. Follows the official @supabase/ssr middleware pattern.
 */
export function createSupabaseMiddlewareClient(request: NextRequest): {
  supabase: SupabaseClient;
  response: NextResponse;
} {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror onto the request (for any later read in this pass) and onto a fresh response
        // (so the browser receives rotated cookies).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  return { supabase, response };
}
