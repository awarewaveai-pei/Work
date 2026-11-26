// The one map of Resend accounts to the organizations that send through them. A Resend account has one quota; every
// organization on it sees that one number (lib/schedules/mail-quota.ts). Keys are read from the environment only.
// lib/mail/resend.ts sendMail still reads RESEND_API_KEY directly (the main account); an organization moving accounts
// changes this table and its sender, never the quota job.

export interface ResendAccount {
  id: string;
  /** What a person reads. */
  label: string;
  /** Environment variable holding the account's API key. */
  envKey: string;
  /** Organization slugs sending through this account. */
  orgSlugs: readonly string[];
}

export const RESEND_ACCOUNTS: readonly ResendAccount[] = [
  { id: "main", label: "主帳號", envKey: "RESEND_API_KEY", orgSlugs: ["awarewave-ops", "soulful-expression"] },
  { id: "oracle", label: "算命站帳號", envKey: "RESEND_API_KEY_ORACLE", orgSlugs: ["oracle-aware-wave-com"] },
];

export function resendAccountFor(orgSlug: string | null | undefined): ResendAccount | null {
  return (orgSlug && RESEND_ACCOUNTS.find((a) => a.orgSlugs.includes(orgSlug))) || null;
}

/** The other organizations on the same account (empty = it has the account to itself). */
export function sharedWith(account: ResendAccount, orgSlug: string): string[] {
  return account.orgSlugs.filter((s) => s !== orgSlug);
}

/** The account's key, or null when the environment does not set it. */
export function resendKey(account: ResendAccount, env: Record<string, string | undefined>): string | null {
  return env[account.envKey]?.trim() || null;
}
