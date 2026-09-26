// T22: does a public SECURITY DEFINER function's anon/authenticated EXECUTE grant stay revoked as
// of the LAST migration that touches it (defines it or grants/revokes on it) -- not merely "does
// its defining migration itself carry a revoke". Two real functions
// (archive_stale_repair_runs, upsert_incident_atomic) are fixed exactly this way: a LATER
// migration (0064) added the missing anon/authenticated revoke without redefining them. A rule
// that only inspected the defining migration would misreport both as still broken.
//
// RULE: walk every migration oldest-to-newest, tracking per (schema.name, argument-type-list):
//   - a CREATE for a signature never seen before (or seen but currently DROPped) is a "fresh"
//     object -- Postgres/Supabase's ALTER DEFAULT PRIVILEGES re-grants anon+authenticated EXECUTE
//     on it, so anonRevoked/authenticatedRevoked reset to false.
//   - a CREATE OR REPLACE of an already-existing signature preserves grants (Postgres does not
//     reset ACLs on REPLACE) -- anonRevoked/authenticatedRevoked are left unchanged.
//   - a REVOKE ... ON FUNCTION ... FROM <roles> sets anonRevoked/authenticatedRevoked true for
//     whichever of those two roles appear in <roles>, from that point forward, REGARDLESS of
//     whether this migration also defines the function.
//   - a GRANT ... ON FUNCTION ... TO <roles> (or ON ALL FUNCTIONS IN SCHEMA) re-opens it for anon /
//     authenticated / PUBLIC (PUBLIC covers both) -- a deliberate grant belongs in the allowlist.
//   - a DROP FUNCTION removes the signature (exists=false); a later CREATE of the exact same
//     signature is then "fresh" again (see above), matching the DROP+CREATE class risk 0064
//     documents (CREATE OR REPLACE alone never resets ACLs; an explicit DROP first does).
// A signature is a violation only if it currently exists, its LATEST definition is
// SECURITY DEFINER, and it is not (anonRevoked && authenticatedRevoked) as of the last migration.
//
// Parsing: comments (--, /* */), single-quoted strings, and dollar-quoted bodies ($$...$$ /
// $tag$...$tag$) are blanked out (same length, so offsets survive) before any keyword regex runs,
// so text inside a function body or a comment is never mistaken for a statement. Statements are
// then found on the redacted text and ordered by source offset within a file, and by migration
// number across files.

export interface MigrationFile {
  file: string;
  text: string;
}

export interface SecDefFunctionState {
  key: string; // "schema.name(type1,type2,...)"
  schema: string;
  name: string;
  argTypes: string[];
  definingFile: string; // latest migration whose CREATE (re)defines this exact signature
  securityDefiner: boolean; // per that latest definition
  anonRevoked: boolean;
  authenticatedRevoked: boolean;
  exists: boolean; // false if the most recent event for this signature was a DROP
}

const TYPE_SYNONYMS: Record<string, string> = {
  int: "integer",
  int4: "integer",
  bool: "boolean",
  int8: "bigint",
  float8: "double precision",
  float4: "real",
};

function normalizeType(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return TYPE_SYNONYMS[t] ?? t;
}

/** Split a parenthesized argument-list body on top-level commas (depth-aware, ignores none here
 * since dollar-bodies/strings are already blanked before this ever runs on a CREATE's arg list --
 * but a stray nested paren in a type like numeric(10,2) is still handled by depth tracking). */
function splitArgs(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** CREATE's arg list has "name type[ default expr]" per parameter; keep only the type. */
function createArgTypes(body: string): string[] {
  return splitArgs(body).map((p) => {
    const defaultMatch = /\bdefault\b|=/i.exec(p);
    const withoutDefault = (defaultMatch ? p.slice(0, defaultMatch.index) : p).trim();
    const tokens = withoutDefault.split(/\s+/).filter(Boolean);
    // First token is the parameter name (this codebase never uses IN/OUT/INOUT mode keywords, and
    // every CREATE FUNCTION here names every parameter) -- the rest is the (possibly multi-word) type.
    return normalizeType(tokens.slice(1).join(" "));
  });
}

/** REVOKE/DROP arg lists are bare types, no parameter names ("int", "uuid, uuid, text"). */
function bareArgTypes(body: string): string[] {
  return splitArgs(body)
    .map((p) => normalizeType(p))
    .filter(Boolean);
}

function findMatchingParen(text: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unbalanced parentheses starting at offset ${openParenIndex}`);
}

/** Blank comments, string literals, and dollar-quoted bodies to same-length whitespace/newlines
 * (offsets survive) so keyword regexes never match inside them. */
export function redact(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j++;
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }
    if (sql[i] === "$") {
      const tagMatch = /^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const opener = tagMatch[0];
        const closerIdx = sql.indexOf(opener, i + opener.length);
        const stop = closerIdx === -1 ? n : closerIdx + opener.length;
        out += blank(sql.slice(i, stop));
        i = stop;
        continue;
      }
    }
    out += sql[i];
    i++;
  }
  return out;
}

interface RawEvent {
  offset: number;
  kind: "create" | "drop" | "revoke" | "grant" | "grant_all_in_schema";
  schema: string;
  name: string; // "" for grant_all_in_schema
  argTypes: string[];
  securityDefiner?: boolean; // "create" only
  roles?: string[]; // "revoke" / "grant" / "grant_all_in_schema"
}

const CREATE_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(/gi;
const DROP_RE = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(/gi;
const REVOKE_RE = /REVOKE\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(/gi;
const GRANT_RE = /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:([a-zA-Z_][\w]*)\.)?([a-zA-Z_][\w]*)\s*\(/gi;
const GRANT_ALL_IN_SCHEMA_RE = /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+([a-zA-Z_][\w]*)\s+TO\s+([^;]+)/gi;

/** "anon, authenticated" / "PUBLIC" / "service_role WITH GRANT OPTION" -> lower-case role names. */
function roleList(text: string): string[] {
  return text
    .replace(/\bWITH\s+GRANT\s+OPTION\b/i, "")
    .replace(/\bGRANTED\s+BY\b[\s\S]*$/i, "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Where a CREATE FUNCTION's preamble (LANGUAGE/SECURITY/SET ... between the arg list's closing
 * paren and the body) ends. Redaction has already blanked every dollar-quoted body to whitespace
 * -- including its `$tag$` delimiters -- so that marker cannot be found in `redacted` any more;
 * it must be located in `original` instead. Falls back to the next top-level semicolon (in
 * `redacted`, so a stray `;` inside a comment/string is not mistaken for one) for the one real
 * form that has no dollar-quoted body: `LANGUAGE sql AS 'select ...'` single-quoted bodies --
 * none exist in this repo today, but a preamble-search that only worked for `$$` bodies would
 * silently mis-scan one if it were ever added.
 */
function preambleEnd(original: string, redacted: string, afterOffset: number): number {
  const dollarOpener = /\$[a-zA-Z_]*\$/.exec(original.slice(afterOffset));
  if (dollarOpener) return afterOffset + dollarOpener.index;
  const semi = redacted.indexOf(";", afterOffset);
  return semi === -1 ? redacted.length : semi;
}

function extractEvents(original: string, redacted: string): RawEvent[] {
  const events: RawEvent[] = [];

  for (const re of [CREATE_RE, DROP_RE, REVOKE_RE, GRANT_RE, GRANT_ALL_IN_SCHEMA_RE]) re.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = CREATE_RE.exec(redacted))) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findMatchingParen(redacted, openParen);
    const argBody = redacted.slice(openParen + 1, closeParen);
    const afterArgs = redacted.slice(closeParen + 1, preambleEnd(original, redacted, closeParen + 1));
    // Default (no SECURITY clause at all) is INVOKER. Last mention wins if somehow both appear
    // (Postgres itself rejects that as invalid, but this is a static scan, not a real parser).
    const secMatches = [...afterArgs.matchAll(/SECURITY\s+(DEFINER|INVOKER)/gi)];
    const securityDefiner = secMatches.length > 0 && secMatches[secMatches.length - 1][1].toUpperCase() === "DEFINER";
    events.push({
      offset: m.index,
      kind: "create",
      schema: (m[1] ?? "public").toLowerCase(),
      name: m[2].toLowerCase(),
      argTypes: createArgTypes(argBody),
      securityDefiner,
    });
  }

  while ((m = DROP_RE.exec(redacted))) {
    const openParen = m.index + m[0].length - 1;
    const closeParen = findMatchingParen(redacted, openParen);
    const argBody = redacted.slice(openParen + 1, closeParen);
    events.push({
      offset: m.index,
      kind: "drop",
      schema: (m[1] ?? "public").toLowerCase(),
      name: m[2].toLowerCase(),
      argTypes: bareArgTypes(argBody),
    });
  }

  for (const [re, kind, keyword] of [
    [REVOKE_RE, "revoke", /FROM\s+([\s\S]+)/i],
    [GRANT_RE, "grant", /TO\s+([\s\S]+)/i],
  ] as const) {
    while ((m = re.exec(redacted))) {
      const openParen = m.index + m[0].length - 1;
      const closeParen = findMatchingParen(redacted, openParen);
      const argBody = redacted.slice(openParen + 1, closeParen);
      const semi = redacted.indexOf(";", closeParen);
      const tail = redacted.slice(closeParen + 1, semi === -1 ? redacted.length : semi);
      const rolesMatch = keyword.exec(tail);
      events.push({
        offset: m.index,
        kind,
        schema: (m[1] ?? "public").toLowerCase(),
        name: m[2].toLowerCase(),
        argTypes: bareArgTypes(argBody),
        roles: rolesMatch ? roleList(rolesMatch[1].replace(/\b(CASCADE|RESTRICT)\s*$/i, "")) : [],
      });
    }
  }

  while ((m = GRANT_ALL_IN_SCHEMA_RE.exec(redacted))) {
    events.push({ offset: m.index, kind: "grant_all_in_schema", schema: m[1].toLowerCase(), name: "", argTypes: [], roles: roleList(m[2]) });
  }

  return events.sort((a, b) => a.offset - b.offset);
}

/** PUBLIC includes every role, so a grant to it re-opens anon and authenticated alike. */
function opensRoles(roles: string[]): { anon: boolean; authenticated: boolean } {
  const pub = roles.includes("public");
  return { anon: pub || roles.includes("anon"), authenticated: pub || roles.includes("authenticated") };
}

function keyOf(schema: string, name: string, argTypes: string[]): string {
  return `${schema}.${name}(${argTypes.join(",")})`;
}

/**
 * Scans migrations (oldest-first, as `migrationFiles()` returns) and returns the state of every
 * function signature ever created, keyed by the normalized (schema, name, argTypes) it currently
 * resolves to. Only entries with `exists === true` are live; callers filtering for the T22 rule
 * additionally require `securityDefiner === true`.
 */
export function scanSecurityDefinerFunctions(files: MigrationFile[]): Map<string, SecDefFunctionState> {
  const states = new Map<string, SecDefFunctionState>();

  for (const { file, text } of files) {
    const redacted = redact(text);
    const events = extractEvents(text, redacted);
    for (const ev of events) {
      if (ev.kind === "grant_all_in_schema") {
        const opens = opensRoles(ev.roles ?? []);
        for (const [k, s] of states) {
          if (s.schema !== ev.schema || !s.exists) continue;
          states.set(k, { ...s, anonRevoked: s.anonRevoked && !opens.anon, authenticatedRevoked: s.authenticatedRevoked && !opens.authenticated });
        }
        continue;
      }
      const key = keyOf(ev.schema, ev.name, ev.argTypes);
      const prior = states.get(key);
      if (ev.kind === "create") {
        const fresh = !prior || !prior.exists;
        states.set(key, {
          key,
          schema: ev.schema,
          name: ev.name,
          argTypes: ev.argTypes,
          definingFile: file,
          securityDefiner: ev.securityDefiner ?? false,
          anonRevoked: fresh ? false : prior!.anonRevoked,
          authenticatedRevoked: fresh ? false : prior!.authenticatedRevoked,
          exists: true,
        });
      } else if (ev.kind === "drop") {
        if (prior) {
          states.set(key, { ...prior, exists: false, anonRevoked: false, authenticatedRevoked: false });
        }
        // A DROP of a signature this scan never saw created (e.g. a bootstrap function predating
        // migration 0001) is not this test's concern -- nothing to report on either way.
      } else {
        const base: SecDefFunctionState =
          prior ?? {
            key,
            schema: ev.schema,
            name: ev.name,
            argTypes: ev.argTypes,
            definingFile: file,
            securityDefiner: false,
            anonRevoked: false,
            authenticatedRevoked: false,
            exists: false, // a revoke alone never brings a function into existence
          };
        const roles = ev.roles ?? [];
        if (ev.kind === "grant") {
          const opens = opensRoles(roles);
          states.set(key, {
            ...base,
            anonRevoked: base.anonRevoked && !opens.anon,
            authenticatedRevoked: base.authenticatedRevoked && !opens.authenticated,
          });
        } else {
          states.set(key, {
            ...base,
            anonRevoked: base.anonRevoked || roles.includes("anon"),
            authenticatedRevoked: base.authenticatedRevoked || roles.includes("authenticated"),
          });
        }
      }
    }
  }

  return states;
}

/** Live, existing SECURITY DEFINER functions (the T22 checklist) -- everything else filtered out. */
export function liveSecurityDefinerFunctions(files: MigrationFile[]): SecDefFunctionState[] {
  return [...scanSecurityDefinerFunctions(files).values()].filter((s) => s.exists && s.securityDefiner);
}
