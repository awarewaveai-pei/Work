// One policy for every @supabase/ssr client. Browser-visible auth origins are HTTPS-only.
// Keep httpOnly/sameSite/path on the library defaults; browser-side token refresh requires JS
// access, while transport security must never depend on an implicit default.
export const SUPABASE_AUTH_COOKIE_OPTIONS = { secure: true } as const;
