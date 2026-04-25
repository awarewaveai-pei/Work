import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function getReadonlyKey() {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/** Read-only client (anon). Safe for listing when service role is not configured. */
export function getSupabaseReadClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getReadonlyKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Write-capable client (service role). Required for any mutating ops endpoints. */
export function getSupabaseWriteClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** Prefer write client; fall back to read client for GET-only routes. */
export function getSupabaseServerClient(): SupabaseClient | null {
  return getSupabaseWriteClient() ?? getSupabaseReadClient();
}
