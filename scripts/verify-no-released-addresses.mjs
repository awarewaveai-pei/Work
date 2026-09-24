#!/usr/bin/env node
/**
 * verify-no-released-addresses.mjs
 *
 * Invariant: no live config may TRUST (allowlist, set_real_ip_from, ignoreip, access rule) or
 * TARGET (ssh/rsync/webhook/DNS) an address AwareWave no longer owns.
 * Registry SSOT: agency-os/config/released-addresses.json (append-only).
 *
 * Why: three hosts were released 2026-08-30/31; on 2026-09-23 their addresses were still live in
 * Cloudflare whitelist rules (204.168.175.41 now belongs to a third party), fail2ban ignoreip,
 * lobster-nginx set_real_ip_from and root-owned migration scripts (StrictHostKeyChecking=accept-new).
 * No single check looked at all of those places. Cloudflare is covered by
 * scripts/check-cloudflare-security.ps1 reading the same registry; this file covers repo + host.
 *
 * Modes:
 *   (default)   repo gate over git-tracked code/config. Out of scope by design: docs, history
 *               (WORKLOG/reports/memory/handoffs), tests (the config a test exercises is scanned
 *               directly). Occurrences inside comments are not violations.
 *   --host <user@host> [--port N] [--identity FILE]
 *               read-only sweep of a live host over `ssh ... sudo -n bash -s`: /etc /root /home
 *               /opt /srv, crontabs, /usr/local/{bin,sbin}, docker container env. Not a gate.
 *   --ssh-config [FILE]
 *               operator machine: every concrete `Host` alias in FILE (default ~/.ssh/config, plus
 *               its Include files) resolved through `ssh -G` (and DNS when the HostName is a name).
 *               An alias hides the address from the repo gate -- the 2026-09-24 case: aliases for
 *               released SG/EU addresses kept being the default target of 7 operator scripts.
 *   --json      machine-readable result.
 *
 * Opt-out per line: `released-ip-ok: <reason>` on the same line (always reported, never silent).
 * Tracked debt: registry.knownViolations, matched by file + exact trimmed line (an edited line
 * stops matching and becomes NEW again).
 *
 * Exit: 0 = no new violation, 1 = new violation(s), 2 = error.
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve, extname, dirname, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { lookup } from 'node:dns/promises';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
export const REGISTRY_REL = 'agency-os/config/released-addresses.json';

// ------------------------------------------------------------------ address math

function ipv4ToBig(s) {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const o of parts) {
    if (!/^\d{1,3}$/.test(o) || Number(o) > 255) return null;
    n = (n << 8n) | BigInt(Number(o));
  }
  return n;
}

function ipv6ToBig(s) {
  if (!s.includes(':') || !/^[0-9a-fA-F:]+$/.test(s)) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if ([...head, ...tail].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  return groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}

/** "a.b.c.d[/len]" or IPv6 "[/len]" -> { family, addr, len, bits, text } | null */
export function parseCidr(text) {
  const m = /^([^/\s]+)(?:\/(\d{1,3}))?$/.exec(String(text).trim());
  if (!m) return null;
  const v4 = ipv4ToBig(m[1]);
  const addr = v4 !== null ? v4 : ipv6ToBig(m[1]);
  if (addr === null) return null;
  const family = v4 !== null ? 4 : 6;
  const bits = family === 4 ? 32 : 128;
  const len = m[2] === undefined ? bits : Number(m[2]);
  if (len > bits) return null;
  return { family, addr, len, bits, text: String(text).trim() };
}

// A token broader than this is "anyone"-class (0.0.0.0/0, 10.0.0.0/8), not a grant to one host.
// Deliberate (codex 2026-09-23 F3 rejected): `set_real_ip_from 0.0.0.0/0` trusts everyone, which is a
// different defect with its own detector (origin lockdown / nginx geo guard), and flagging every
// broad CIDR here would bury the released-address signal this gate exists to surface.
const MIN_PREFIX = { 4: 16, 6: 32 };

/** Token written in a file vs a released range: overlap when the shorter prefix contains the other. */
export function overlaps(token, range) {
  if (token.family !== range.family || token.len < MIN_PREFIX[token.family]) return false;
  const shift = BigInt(token.bits - Math.min(token.len, range.len));
  return token.addr >> shift === range.addr >> shift;
}

const V4_TOKEN = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?(?!\d|\.\d)/g;
const V6_TOKEN = /(?<![0-9A-Fa-f:])((?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4})(?:\/(\d{1,3}))?(?![0-9A-Fa-f:])/g;

export function findAddressHits(line, ranges) {
  const hits = [];
  for (const [re, family] of [[V4_TOKEN, 4], [V6_TOKEN, 6]]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const tok = parseCidr(m[2] === undefined ? m[1] : `${m[1]}/${m[2]}`);
      if (!tok || tok.family !== family) continue;
      const range = ranges.find((r) => overlaps(tok, r));
      if (range) hits.push({ index: m.index, token: m[0], range: range.text });
    }
  }
  return hits;
}

/** Cheap whole-text prefilter: first 2 octets (v4) / first 2 groups (v6) of every range. */
export function anchorRegex(ranges, flavor = 'js') {
  const parts = ranges.map((r) => {
    if (r.family === 4) return r.text.split('.').slice(0, 2).join('\\.') + '\\.';
    const g = r.text.split('/')[0].split(':').slice(0, r.len >= 32 ? 2 : 1);
    return g.map((x) => '0*' + x.replace(/^0+(?=.)/, '')).join(':') + ':';
  });
  const src = [...new Set(parts)].join('|');
  return flavor === 'js' ? new RegExp(src, 'i') : src;
}

// ------------------------------------------------------------------ comment classification

const HASH = 'hash', SLASH = 'slash', SQL = 'sql', XML = 'xml', NONE = 'none', PHP = 'php';
const FAMILY_BY_EXT = new Map([
  ...['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.go', '.java', '.c', '.h', '.cc',
    '.cpp', '.hpp', '.cs', '.rs', '.swift', '.kt', '.kts', '.scala', '.dart', '.jsonc', '.css',
    '.scss', '.less'].map((e) => [e, SLASH]),
  ['.sql', SQL],
  ...['.html', '.htm', '.xml', '.vue', '.svelte'].map((e) => [e, XML]),
  ['.json', NONE],
  ['.php', PHP],
]);

/** Everything unlisted (sh ps1 py yml conf env toml ini Dockerfile extensionless ...) uses `#`. */
export function familyOf(path) {
  return FAMILY_BY_EXT.get(extname(path).toLowerCase()) ?? HASH;
}

function quotesBalanced(s) {
  // Backticks (template literals) count too: `Expected image/* ...` opened a "block comment"
  // that hid the next 30 lines of a .ts file from the scan (codex/critic 2026-09-23).
  let dq = 0, sq = 0, bt = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '"' && sq % 2 === 0 && bt % 2 === 0) dq++;
    else if (c === "'" && dq % 2 === 0 && bt % 2 === 0) sq++;
    else if (c === '`' && dq % 2 === 0 && sq % 2 === 0) bt++;
  }
  return dq % 2 === 0 && sq % 2 === 0 && bt % 2 === 0;
}

function lineCommentAt(line, from, family) {
  const markers = { [HASH]: ['#'], [SQL]: ['--'], [PHP]: ['//', '#'], [SLASH]: ['//'] }[family] ?? [];
  let best = -1;
  for (const mk of markers) {
    for (let p = line.indexOf(mk, from); p !== -1; p = line.indexOf(mk, p + mk.length)) {
      const prev = p === 0 ? '' : line[p - 1];
      // `//` of a URL scheme is not a comment; `#`/`--` must start a token (not ${v#x}, not a-b--c).
      const starts = mk === '//' ? prev !== ':' : p === 0 || /\s/.test(prev);
      if (starts && quotesBalanced(line.slice(0, p))) {
        if (best === -1 || p < best) best = p;
        break;
      }
    }
  }
  return best;
}

function blockDelims(family, ps1) {
  if (family === XML) return ['<!--', '-->'];
  if (family === SLASH || family === SQL || family === PHP) return ['/*', '*/'];
  if (family === HASH && ps1) return ['<#', '#>'];
  return null;
}

/** Comment character ranges of one line, given whether a block comment is already open. */
export function commentRanges(line, family, ps1, inBlock) {
  const ranges = [];
  const delims = blockDelims(family, ps1);
  let i = 0;
  if (inBlock && delims) {
    const j = line.indexOf(delims[1]);
    if (j === -1) return { ranges: [[0, line.length]], inBlock: true };
    ranges.push([0, j + delims[1].length]);
    i = j + delims[1].length;
  }
  for (;;) {
    const lc = lineCommentAt(line, i, family);
    let bo = delims ? line.indexOf(delims[0], i) : -1;
    let j = -1;
    while (bo !== -1) {
      if (quotesBalanced(line.slice(0, bo))) {
        j = line.indexOf(delims[1], bo + delims[0].length);
        // A multi-line block may only OPEN at the start of a line (whitespace before it) unless
        // the family has no string/regex literals (XML, PowerShell <# #>): a mid-line `/*` with no
        // `*/` on the same line is a regex class like /[ \t/*#-]*/ or a string, not a comment.
        // Over-matches a mid-line multi-line comment as code -- the safe direction.
        if (j !== -1 || family === XML || (family === HASH && ps1) || line.slice(0, bo).trim() === '') break;
      }
      bo = line.indexOf(delims[0], bo + 1);
    }
    if (lc !== -1 && (bo === -1 || lc < bo)) { ranges.push([lc, line.length]); return { ranges, inBlock: false }; }
    if (bo === -1) return { ranges, inBlock: false };
    if (j === -1) { ranges.push([bo, line.length]); return { ranges, inBlock: true }; }
    ranges.push([bo, j + delims[1].length]);
    i = j + delims[1].length;
  }
}

const ANNOTATION = /released-ip-ok:\s*(\S.{2,})/;

/** Unescaped backticks OUTSIDE ordinary quotes (template-literal delimiters), for the cross-line
 *  state below. A backtick inside "..." or '...' is a character, not a delimiter (codex r2 F1). */
function backtickCount(s) {
  let n = 0, dq = false, sq = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '"' && !sq) dq = !dq;
    else if (c === "'" && !dq) sq = !sq;
    else if (c === '`' && !dq && !sq) n++;
  }
  return n;
}

/** Live (non-comment) released-address occurrences in one file's text. */
export function scanText(path, text, ranges) {
  const family = familyOf(path);
  const ps1 = /\.ps[md]?1$/i.test(path);
  const found = [];
  let inBlock = false;
  // slash family only: a template literal spanning lines is a STRING, so a line inside it that
  // happens to start with `/*` must not open a block comment and hide the code after the literal
  // (codex 2026-09-23 F2). Addresses inside the literal still count as live (a URL in a string).
  let inTemplate = false;
  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    let cr;
    let base = 0;
    if (family === SLASH && inTemplate) {
      let k = -1;
      for (let i = 0; i < line.length; i++) { if (line[i] === '\\') { i++; continue; } if (line[i] === '`') { k = i; break; } }
      if (k === -1) cr = { ranges: [], inBlock };
      else {
        base = k + 1;
        const sub = commentRanges(line.slice(base), family, ps1, inBlock);
        cr = { ranges: sub.ranges.map(([a, c]) => [a + base, c + base]), inBlock: sub.inBlock };
        inTemplate = false;
      }
    } else {
      cr = commentRanges(line, family, ps1, inBlock);
    }
    inBlock = cr.inBlock;
    if (family === SLASH && !inTemplate) {
      let code = '';
      for (let i = base; i < line.length; i++) code += cr.ranges.some(([a, c]) => i >= a && i < c) ? ' ' : line[i];
      if (backtickCount(code) % 2 === 1) inTemplate = true;
    }
    const live = findAddressHits(line, ranges).filter((h) => !cr.ranges.some(([a, b]) => h.index >= a && h.index < b));
    if (!live.length) continue;
    const ann = ANNOTATION.exec(line);
    found.push({
      file: path,
      line: n + 1,
      text: line.trim(),
      hits: live.map((h) => `${h.token} in ${h.range}`),
      annotation: ann ? ann[1].trim() : null,
    });
  }
  return found;
}

// ------------------------------------------------------------------ registry + classification

export function loadRegistry(raw) {
  const reg = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (reg.schemaVersion !== 1) throw new Error(`unsupported schemaVersion ${reg.schemaVersion}`);
  if (!Array.isArray(reg.released) || !reg.released.length) throw new Error('released[] is empty');
  const ranges = reg.released.map((e) => {
    const r = parseCidr(e.cidr);
    if (!r) throw new Error(`unparseable cidr: ${e.cidr}`);
    return r;
  });
  const known = (reg.knownViolations ?? []).map((k) => {
    if (!k.file || !k.line || !k.task) throw new Error('knownViolations entries need file, line, task');
    return k;
  });
  return { ranges, known };
}

/** Split findings into new / known / annotated; report known entries that no longer match. */
export function classify(findings, known) {
  const used = new Set();
  const out = { newViolations: [], known: [], annotated: [], staleKnown: [] };
  for (const f of findings) {
    // each known entry matches ONE line; a second identical line (a copied compose stanza) is NEW
    const k = known.findIndex((kv, i) => !used.has(i) && kv.file === f.file && kv.line.trim() === f.text);
    if (f.annotation) out.annotated.push(f);
    else if (k !== -1) { used.add(k); out.known.push({ ...f, task: known[k].task }); }
    else out.newViolations.push(f);
  }
  known.forEach((kv, i) => { if (!used.has(i)) out.staleKnown.push(kv); });
  return out;
}

// ------------------------------------------------------------------ repo mode

const OUT_OF_SCOPE_PREFIXES = [
  'agency-os/reports/', 'agency-os/WORKLOG-archive/', 'agency-os/memory/', 'agency-os/handoffs/',
  'agency-os/docs/', 'docs/', 'runbooks/', 'tests/',
];
const DOC_EXTS = new Set(['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc', '.csv', '.tsv', '.jsonl', '.log']);

export function inRepoScope(rel) {
  const p = rel.replace(/\\/g, '/');
  if (p === REGISTRY_REL) return false; // the definition, not a use
  if (OUT_OF_SCOPE_PREFIXES.some((x) => p.startsWith(x))) return false;
  if (/(^|\/)(__tests__|__fixtures__|fixtures|tests?)\//.test(p)) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p)) return false;
  return !DOC_EXTS.has(extname(p).toLowerCase());
}

export function scanRepo(root, ranges) {
  const listed = execFileSync('git', ['-C', root, 'ls-files', '-z'], { maxBuffer: 256 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  const anchor = anchorRegex(ranges);
  const inScope = listed.filter(inRepoScope);
  const findings = [];
  let candidates = 0, skipped = 0;
  for (const rel of inScope) {
    const abs = join(root, rel);
    let text;
    try {
      if (statSync(abs).size > 5 * 1024 * 1024) { skipped++; continue; }
      const buf = readFileSync(abs);
      if (buf.subarray(0, 8192).includes(0)) { skipped++; continue; } // binary
      text = buf.toString('utf8');
    } catch { skipped++; continue; } // deleted in worktree / unreadable: git status is the tool for that
    if (!anchor.test(text)) continue;
    candidates++;
    findings.push(...scanText(rel, text, ranges));
  }
  return { scope: 'repo', filesListed: listed.length, filesInScope: inScope.length, candidates, skipped, findings };
}

// ------------------------------------------------------------------ host mode (read-only)

// Runs as root on the host. Prints raw candidate lines (credentials in URLs/key=value masked
// host-side) for the precise classifier here. The repo checkout /root/Work is skipped (the repo
// gate covers it); backup copies are counted, not failed.
// Exported for the test that runs it through real sed. Rule 1 masks userinfo in URLs; rule 2 masks
// a secret-looking key's value (key matched as a substring, as before: API_TOKEN, DB_PASSWORD) ONLY
// when that value contains a character no address can contain
// (so 5.223.93.113 / 2001:41d0::1 / 10.0.0.0/8 survive -- the first version masked every value
// after ...BYPASS_IPS= / ...PASSTHROUGH_HOST: / PRIVATE_NETWORK_PEER=, hiding the very hits this
// sweep exists to find). A hex-only token therefore stays visible in the sweep output, which is
// printed locally and never written to a report. No `cut`: a long line's address is still a hit.
export const MASK_SED = String.raw`s#(://)[^/@[:space:]]+@#\1***@#g; s#((pass|pwd|secret|token|apikey|api_key|private)[A-Za-z0-9_]*["[:space:]]*[=:][[:space:]]*)[^[:space:],;]*[^[:space:],;0-9a-fA-F:./][^[:space:],;]*#\1***#Ig`;
const HOST_SCRIPT = String.raw`set -u
RX="$1"
mask() { sed -E '${MASK_SED}'; }
timeout 300 nice -n 19 grep -rIinE "$RX" /etc /root /home /opt /srv /var/spool/cron /usr/local/bin /usr/local/sbin \
  --exclude-dir=Work --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=.cache \
  --exclude-dir=snap --exclude-dir=.npm --exclude-dir=.vscode-server --exclude-dir='backups*' \
  --exclude='*.log' --exclude='*.log.[0-9]*' --exclude='known_hosts*' --exclude='*.gz' 2>/dev/null | mask
echo "@@GREP_EXIT=${'$'}{PIPESTATUS[0]}"
for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null); do
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" 2>/dev/null | grep -iE "$RX" | mask | sed "s#^#@@ENV $c #"
done
echo "@@DONE"
`;

const BACKUP_NAME = /\.(bak|orig|old)(\b|[-._])|\.pre-|safe-patch-|\.before-|\.bak$/i;
const REPO_MIRROR = /\/(agency-os|Projects)\//; // deployed copies of monorepo trees: repo gate's job

export { HOST_SCRIPT };

export function parseHostOutput(stdout, ranges) {
  const findings = [];
  let backups = 0, mirrors = 0, grepExit = null, done = false;
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.startsWith('@@GREP_EXIT=')) { grepExit = Number(raw.slice(12)); continue; }
    if (raw === '@@DONE') { done = true; continue; }
    const env = /^@@ENV (\S+) (.*)$/.exec(raw);
    if (env) {
      // container env has no comments: any in-range address is live
      const hits = findAddressHits(env[2], ranges);
      if (hits.length) findings.push({ file: `container:${env[1]}`, line: 0, text: env[2].split('=')[0] + '=…', hits: hits.map((h) => `${h.token} in ${h.range}`), annotation: null });
      continue;
    }
    const m = /^([^:]+):(\d+):(.*)$/.exec(raw);
    if (!m) continue;
    const [, path, lineNo, content] = m;
    if (BACKUP_NAME.test(path)) { if (findAddressHits(content, ranges).length) backups++; continue; }
    if (REPO_MIRROR.test(path) || DOC_EXTS.has(extname(path).toLowerCase())) { mirrors++; continue; }
    for (const f of scanText(path, content, ranges)) findings.push({ ...f, line: Number(lineNo) });
  }
  return { findings, backups, mirrors, grepExit, done };
}

function scanHost(args, ranges) {
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15'];
  if (args.port) sshArgs.push('-p', String(args.port));
  if (args.identity) sshArgs.push('-i', args.identity);
  const rx = anchorRegex(ranges, 'grep');
  const r = spawnSync('ssh', [...sshArgs, args.host, `sudo -n bash -s -- '${rx}'`], {
    input: HOST_SCRIPT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 400_000,
  });
  if (r.error) return { error: `ssh failed: ${r.error.message}` };
  const parsed = parseHostOutput(r.stdout ?? '', ranges);
  if (!parsed.done) return { error: `host sweep did not finish (ssh exit ${r.status}): ${(r.stderr ?? '').trim().slice(0, 300)}` };
  // grep: 0 = matches, 1 = none, 2 = some unreadable path (acceptable), 124 = timeout (blind)
  if (parsed.grepExit === 124) return { error: 'host grep timed out (300s): sweep is incomplete' };
  return { scope: `host ${args.host}`, ...parsed };
}

// ------------------------------------------------------------------ ssh-config mode (operator machine)

/** Concrete aliases (no * ? ! patterns) with their 1-based line and the block's own HostName (static,
 *  first one wins like ssh), plus Include patterns, from ssh_config text. */
export function parseSshConfig(text) {
  const hosts = [], includes = [];
  let block = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const h = /^\s*Host\s+(.+?)\s*$/i.exec(l);
    if (h) {
      block = h[1].split(/\s+/).filter((n) => !/[*?!]/.test(n)).map((alias) => ({ alias, line: i + 1, hostName: null }));
      hosts.push(...block);
      return;
    }
    if (/^\s*Match\s/i.test(l)) { block = []; return; }
    const hn = /^\s*HostName\s+(\S+)/i.exec(l);
    if (hn) for (const b of block) b.hostName ??= hn[1];
    const inc = /^\s*Include\s+(.+?)\s*$/i.exec(l);
    if (inc) includes.push(...inc[1].split(/\s+/));
  });
  return { hosts, includes };
}

/** `hostname` value of `ssh -G <alias>` output. */
export function hostnameFromSshG(out) {
  const m = /^hostname\s+(\S+)/m.exec(out ?? '');
  return m ? m[1] : null;
}

// ssh_config Include: relative paths are under ~/.ssh; `*` in the last path segment only (enough for
// conf.d-style includes; anything fancier still resolves through `ssh -G`, it just is not enumerated).
function expandInclude(pattern) {
  const p = isAbsolute(pattern) ? pattern : pattern.startsWith('~') ? join(homedir(), pattern.slice(1)) : join(homedir(), '.ssh', pattern);
  if (!/[*?]/.test(basename(p))) return existsSync(p) ? [p] : [];
  const re = new RegExp('^' + basename(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  try { return readdirSync(dirname(p)).filter((f) => re.test(f)).map((f) => join(dirname(p), f)); } catch { return []; }
}

/** Findings for aliases whose resolved HostName (IP literal, or DNS answer) is in a released range. */
export async function scanSshConfig(file, ranges, deps = {}) {
  const sshG = deps.sshG ?? ((alias) => spawnSync('ssh', ['-G', '-F', file, alias], { encoding: 'utf8', timeout: 15_000 }));
  const resolveName = deps.resolveName ?? (async (name) => (await lookup(name, { all: true })).map((a) => a.address));
  if (!existsSync(file)) return { scope: `ssh-config ${file}`, findings: [], hosts: 0, note: 'no ssh config file' };
  const seen = new Set(), files = [file], hosts = [];
  while (files.length) {
    const f = files.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const { hosts: h, includes } = parseSshConfig(readFileSync(f, 'utf8'));
    hosts.push(...h.map((x) => ({ ...x, file: f })));
    for (const inc of includes) files.push(...expandInclude(inc));
  }
  // Both sources are checked: `ssh -G` (Match/Include/defaults exactly as ssh applies them) AND the
  // block's static HostName (an ssh build that cannot follow an Include path, or no ssh client at all,
  // must not turn an alias into a silent "unresolvable").
  const findings = [];
  let unresolved = 0;
  for (const { alias, line, hostName, file: f } of hosts) {
    let viaSsh = null;
    try { viaSsh = hostnameFromSshG(sshG(alias).stdout); } catch { /* no ssh client: static only */ }
    const names = [...new Set([viaSsh, hostName].filter((n) => n && n !== alias))];
    if (!names.length) { unresolved++; continue; }
    const hits = [];
    for (const name of names) {
      let addrs = parseCidr(name) ? [name] : [];
      if (!addrs.length) { try { addrs = await resolveName(name); } catch { continue; } } // unresolvable name = fails closed
      for (const a of addrs) { const t = parseCidr(a); const rg = t && ranges.find((x) => overlaps(t, x)); if (rg) hits.push(`${a} in ${rg.text}`); }
    }
    if (hits.length) findings.push({ file: `ssh-config:${f}`, line, text: `Host ${alias} -> ${names.join(' | ')}`, hits: [...new Set(hits)], annotation: null });
  }
  return { scope: `ssh-config ${file}`, findings, hosts: hosts.length, unresolved };
}

// ------------------------------------------------------------------ CLI

function parseArgs(argv) {
  const a = { json: false, host: null, port: null, identity: null, sshConfig: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--json') a.json = true;
    else if (k === '--ssh-config') a.sshConfig = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : join(homedir(), '.ssh', 'config');
    else if (k === '--host') a.host = argv[++i];
    else if (k === '--port') { a.port = Number(argv[++i]); if (!Number.isInteger(a.port) || a.port < 1 || a.port > 65535) throw new Error('--port needs 1-65535'); }
    else if (k === '--identity') a.identity = argv[++i];
    else throw new Error(`unknown argument: ${k}`);
  }
  if (a.host === undefined || (a.host !== null && !/^[\w.-]+@[\w.:-]+$/.test(a.host))) throw new Error('--host needs user@host');
  return a;
}

function render(res, cls, ranges) {
  const out = [];
  const head = res.scope === 'repo'
    ? `files listed=${res.filesListed} in-scope=${res.filesInScope} candidates=${res.candidates} skipped(>5MB/binary/unreadable)=${res.skipped}`
    : res.scope.startsWith('ssh-config')
      ? `aliases=${res.hosts} unresolvable(fail closed)=${res.unresolved ?? 0}${res.note ? ' ' + res.note : ''}`
      : `backup-copies(not live)=${res.backups} repo-mirror/doc lines skipped=${res.mirrors}`;
  out.push(`released-address check | ${ranges.length} ranges from ${REGISTRY_REL} | scope=${res.scope} | ${head}`);
  const row = (tag, f, extra) => out.push(`  ${tag.padEnd(9)} ${f.file}${f.line ? ':' + f.line : ''}  ${f.text.slice(0, 150)}  [${f.hits.join(', ')}]${extra ? '  ' + extra : ''}`);
  cls.newViolations.forEach((f) => row('NEW', f));
  cls.known.forEach((f) => row('KNOWN', f, `(task: ${f.task})`));
  cls.annotated.forEach((f) => row('ANNOTATED', f, `(released-ip-ok: ${f.annotation})`));
  cls.staleKnown.forEach((k) => out.push(`  STALE     knownViolations entry matches nothing now -> delete it: ${k.file} | ${k.line}`));
  out.push(`RESULT: ${cls.newViolations.length ? 'FAIL' : 'PASS'} new=${cls.newViolations.length} known=${cls.known.length} annotated=${cls.annotated.length} stale-known=${cls.staleKnown.length}`);
  return out.join('\n');
}

async function main() {
  let args, reg;
  try {
    args = parseArgs(process.argv.slice(2));
    reg = loadRegistry(readFileSync(join(REPO, REGISTRY_REL), 'utf8'));
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    return 2;
  }
  const res = args.sshConfig ? await scanSshConfig(args.sshConfig, reg.ranges)
    : args.host ? scanHost(args, reg.ranges) : scanRepo(REPO, reg.ranges);
  if (res.error) { console.error(`ERROR: ${res.error}`); return 2; }
  const cls = classify(res.findings, args.host || args.sshConfig ? [] : reg.known);
  if (args.json) console.log(JSON.stringify({ scope: res.scope, ...cls, meta: { ...res, findings: undefined } }, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  else console.log(render(res, cls, reg.ranges));
  return cls.newViolations.length ? 1 : 0;
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().then((code) => process.exit(code));
