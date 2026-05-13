/**
 * Centralised env-var accessors for all test suites.
 * Never import process.env directly in specs — use these typed helpers
 * so a missing var fails fast at the helper boundary, not mid-test.
 */

export const BASE_URL   = process.env.PLAYWRIGHT_BASE_URL   || 'https://app.aware-wave.com';
export const API_URL    = process.env.PLAYWRIGHT_API_URL    || 'https://api.aware-wave.com';
export const N8N_URL    = process.env.PLAYWRIGHT_N8N_URL    || 'https://n8n.aware-wave.com';
export const CLIENT_URL = process.env.PLAYWRIGHT_CLIENT_URL || '';
export const OPS_TOKEN  = process.env.OPS_API_TOKEN         || '';

// HTTP Basic credentials for app.aware-wave.com (nginx auth_basic "Aware Wave Admin").
// Sourced from mcp/user-env.ps1 → User-scope env (OPS_BASIC_USER / OPS_BASIC_PASSWORD).
// When empty, specs requiring auth fail fast with a clear "set these in user-env.ps1" message.
export const OPS_BASIC_USER     = process.env.OPS_BASIC_USER     || '';
export const OPS_BASIC_PASSWORD = process.env.OPS_BASIC_PASSWORD || '';

export function opsBasicHttpCredentials(): { username: string; password: string } | undefined {
  if (!OPS_BASIC_USER || !OPS_BASIC_PASSWORD) return undefined;
  return { username: OPS_BASIC_USER, password: OPS_BASIC_PASSWORD };
}

/** Directory where explicit page.screenshot() calls write PNG files */
export const SCREENSHOTS_DIR =
  process.env.PLAYWRIGHT_SCREENSHOTS_DIR || './test-results/screenshots';

/** Resolved client hostname (used in screenshot file names) */
export function clientHostname(): string {
  if (!CLIENT_URL) return 'unknown-client';
  try { return new URL(CLIENT_URL).hostname; } catch { return 'unknown-client'; }
}

/** Auth headers when OPS_API_TOKEN is set; empty object otherwise */
export function opsAuthHeaders(): Record<string, string> {
  return OPS_TOKEN ? { Authorization: `Bearer ${OPS_TOKEN}` } : {};
}
