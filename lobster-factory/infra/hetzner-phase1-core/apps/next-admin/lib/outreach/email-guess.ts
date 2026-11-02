// Cold Outreach v2 -- guess a person's work address from the format their company already uses (SPEC D20, card C13.2).
// Pure: nothing is sent, resolved or paid here. The candidates go to MX (verify-email.ts), then to a paid verifier
// (mailbox-verify.ts inferEmail); a guess is never an address until a paid verifier calls it valid.
//
// Only Latin names: a Chinese name has no single spelling (Wade-Giles, Hanyu Pinyin, a chosen English name), so a
// guess from it would be noise that costs a paid check each.

export type EmailFormat = "first.last" | "first" | "f.last" | "last.first" | "firstlast";
/** Most to least common; the first four are tried when the company's own format is unknown. */
export const FORMATS: readonly EmailFormat[] = ["first.last", "first", "f.last", "firstlast", "last.first"];
/** The most candidates one person gets: each one that passes MX costs a paid verification. */
export const MAX_GUESSES = 4;

export interface NameParts { first: string; last: string }
export interface KnownEmail { email: string; name: string | null }

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const letters = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

/** "Mary-Jane O'Neil" -> { first: "maryjane", last: "oneil" }; null unless the name is Latin with a first and a last part. */
export function splitLatinName(full: string | null | undefined): NameParts | null {
  const t = (full ?? "").trim();
  if (!t || /[^\p{Script=Latin}\s.'’-]/u.test(t)) return null;
  const parts = t.split(/\s+/).map(letters).filter(Boolean);
  return parts.length >= 2 ? { first: parts[0], last: parts[parts.length - 1] } : null;
}

export function localPart(f: EmailFormat, n: NameParts): string {
  switch (f) {
    case "first.last": return `${n.first}.${n.last}`;
    case "first": return n.first;
    case "f.last": return `${n.first[0]}.${n.last}`;
    case "last.first": return `${n.last}.${n.first}`;
    case "firstlast": return `${n.first}${n.last}`;
  }
}

/** The format an existing address of this person follows, or null (a role mailbox, a nickname, another shape). */
export function formatOf(email: string, n: NameParts): EmailFormat | null {
  const local = email.trim().toLowerCase().split("@")[0];
  return FORMATS.find((f) => localPart(f, n) === local) ?? null;
}

/** Formats the company's known addresses use, the most used first. Needs the owner's name: a bare address says "has a dot"
 *  but not whether the parts are first.last, f.last or last.first. */
export function companyFormats(known: readonly KnownEmail[]): EmailFormat[] {
  const count = new Map<EmailFormat, number>();
  for (const k of known) {
    const n = splitLatinName(k.name);
    const f = n ? formatOf(k.email, n) : null;
    if (f) count.set(f, (count.get(f) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || FORMATS.indexOf(a[0]) - FORMATS.indexOf(b[0])).map(([f]) => f);
}

/** ≤ MAX_GUESSES addresses at `domain`: the company's own formats first, then the common ones. [] for a non-Latin name
 *  or a domain that is not a hostname. */
export function guessEmails(name: string | null | undefined, domain: string, known: readonly KnownEmail[] = []): string[] {
  const n = splitLatinName(name);
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!n || !DOMAIN_RE.test(d)) return [];
  const own = companyFormats(known);
  const order = own.length > 0 ? [...own, ...FORMATS.filter((f) => !own.includes(f))] : FORMATS;
  return [...new Set(order.map((f) => `${localPart(f, n)}@${d}`))].slice(0, MAX_GUESSES);
}
