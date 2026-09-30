// User-scoped Supabase client for Next.js route handlers.
//
// Unlike getSupabaseWriteClient() (service-role — bypasses RLS), this client operates as the
// AUTHENTICATED USER whose session cookie is present in the incoming request. Supabase RLS
// policies fire normally, so tenant isolation is enforced at the DB layer without any
// application-level .eq('organization_id') guard being strictly required.
//
// Use this (S2 migration) for any route that serves CLIENT users — reads and writes that must
// be scoped to the caller's own org. Keep service-role for true system/admin operations.
//
// @supabase/ssr createServerClient with Next.js cookies() is the canonical SSR pattern.
// The anon key is intentionally public (baked into NEXT_PUBLIC_*); the session JWT in the
// cookie is what authenticates each request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_COOKIE_OPTIONS } from "./auth-cookie-options";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

/**
 * Create a Supabase client that runs as the currently authenticated user.
 * RLS policies apply — the user can only see/modify rows their policies allow.
 *
 * Must be called from a Next.js route handler or Server Component (needs cookies() context).
 * Returns null when Supabase is not configured (same pattern as getSupabaseWriteClient).
 */
export async function createSupabaseUserClient(): Promise<SupabaseClient | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // setAll is intentionally a no-op today, but keep the transport policy attached to this
    // client so a future route-level refresh cannot silently emit a non-Secure cookie.
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // Route handlers are read-only with respect to cookies; refreshed tokens are handled
      // by the middleware on the next request. No setAll needed here.
      setAll() {},
    },
  });
}
