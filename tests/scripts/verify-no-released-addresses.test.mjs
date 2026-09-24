// Unit + integration tests for scripts/verify-no-released-addresses.mjs.
// Run: node --test tests/scripts/verify-no-released-addresses.test.mjs
//
// Mutation-tested manually 2026-09-23 (see WORKLOG): disabled the `cr.ranges.some(...)`
// comment-exclusion filter in scanText -> 3 tests went red (scanText comment-only,
// scanRepo end-to-end, parseHostOutput). First pass caught a bug in the "comment-only line
// is not a violation" test itself (its comment line had no address on it, so it couldn't have
// gone red for the right reason) -- fixed, re-mutated, confirmed red, restored -> all 27 green.
// Confirms the suite is not a false-green import (memory: feedback_cli_script_import_false_green.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'verify-no-released-addresses.mjs');
const mod = await import(pathToFileURL(SCRIPT).href);
const {
  parseCidr, overlaps, findAddressHits, anchorRegex, familyOf, commentRanges, scanText,
  loadRegistry, classify, inRepoScope, scanRepo, parseHostOutput, HOST_SCRIPT, MASK_SED,
  parseSshConfig, hostnameFromSshG, scanSshConfig,
} = mod;

const RANGES = loadRegistry({
  schemaVersion: 1,
  released: [
    { cidr: '5.223.93.113/32' },
    { cidr: '204.168.175.41/32' },
    { cidr: '2001:41d0:d:2572::/64' },
  ],
}).ranges;

// ---------------------------------------------------------------- parseCidr / overlaps

test('parseCidr: v4 bare and with prefix', () => {
  const a = parseCidr('204.168.175.41');
  assert.equal(a.family, 4); assert.equal(a.len, 32); assert.equal(a.bits, 32);
  const b = parseCidr('204.168.0.0/16');
  assert.equal(b.len, 16);
});

test('parseCidr: rejects malformed v4', () => {
  assert.equal(parseCidr('204.168.175.999'), null);
  assert.equal(parseCidr('204.168.175'), null);
  assert.equal(parseCidr('not-an-ip'), null);
});

test('parseCidr: v6 with :: compression and prefix', () => {
  const a = parseCidr('2001:41d0:d:2572::/64');
  assert.equal(a.family, 6); assert.equal(a.len, 64); assert.equal(a.bits, 128);
  const b = parseCidr('::1');
  assert.equal(b.family, 6);
});

test('parseCidr: rejects malformed v6', () => {
  assert.equal(parseCidr('2001::41d0::1'), null); // two ::
  assert.equal(parseCidr('gggg::1'), null);
});

test('overlaps: exact /32 match and containing supernet both hit; disjoint does not', () => {
  const range = parseCidr('204.168.175.41/32');
  assert.equal(overlaps(parseCidr('204.168.175.41/32'), range), true);
  assert.equal(overlaps(parseCidr('204.168.0.0/16'), range), true, 'a supernet token written in a file still covers the released host');
  assert.equal(overlaps(parseCidr('204.168.175.42/32'), range), false);
  assert.equal(overlaps(parseCidr('5.223.93.113/32'), range), false);
});

test('overlaps: token narrower than MIN_PREFIX is ignored (too broad to be a real host reference)', () => {
  const range = parseCidr('204.168.175.41/32');
  assert.equal(overlaps(parseCidr('0.0.0.0/0'), range), false);
  assert.equal(overlaps(parseCidr('10.0.0.0/8'), range), false);
});

test('overlaps: v4 token never matches v6 range', () => {
  const v6range = parseCidr('2001:41d0:d:2572::/64');
  assert.equal(overlaps(parseCidr('204.168.175.41/32'), v6range), false);
});

// ---------------------------------------------------------------- findAddressHits

test('findAddressHits: plain occurrence found, version-number look-alike not', () => {
  const hits = findAddressHits('set_real_ip_from 204.168.175.41/32;', RANGES);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].token, '204.168.175.41/32');
  const clean = findAddressHits('nginx 1.24.0-2ubuntu7.18 on 172.18.0.7', RANGES);
  assert.equal(clean.length, 0);
});

test('findAddressHits: does not false-positive on an unrelated IP embedded near digits', () => {
  const hits = findAddressHits('proxy_pass http://172.18.0.7:80; # not 204.168.175.40 either', RANGES);
  assert.equal(hits.length, 0);
});

test('anchorRegex: matches text containing a released prefix, not unrelated text', () => {
  const rx = anchorRegex(RANGES);
  assert.equal(rx.test('trusted 204.168.175.41 forever'), true);
  assert.equal(rx.test('completely unrelated line'), false);
});

// ---------------------------------------------------------------- comment classification

test('familyOf: extension routing', () => {
  assert.equal(familyOf('nginx/default.conf'), 'hash');
  assert.equal(familyOf('lib/x.ts'), 'slash');
  assert.equal(familyOf('migrations/0001.sql'), 'sql');
  assert.equal(familyOf('app.php'), 'php');
  assert.equal(familyOf('registry.json'), 'none');
});

test('commentRanges: hash line comment covers whole line after #', () => {
  const { ranges } = commentRanges('# EU VPS (204.168.175.41)', 'hash', false, false);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0][0], 0);
});

test('commentRanges: inline hash comment only covers the tail', () => {
  const line = 'OFFSITE_HOST="${OFFSITE_HOST:-5.223.93.113}" # was SG';
  const { ranges } = commentRanges(line, 'hash', false, false);
  const commentStart = line.indexOf('#');
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0][0], commentStart);
  // the address occurs BEFORE the comment starts -> scanText must still flag it
});

test('commentRanges: // inside a URL scheme is not a comment start (slash family)', () => {
  const { ranges } = commentRanges('const u = "http://204.168.175.41/x"; // real comment', 'slash', false, false);
  assert.equal(ranges.length, 1, 'only the trailing // comment, not the :// in the URL');
  assert.ok(ranges[0][0] > line_index('const u = "http://204.168.175.41/x";'));
  function line_index(prefix) { return prefix.length; }
});

test('commentRanges: block comment open/continue/close across three lines', () => {
  const l1 = commentRanges('/* start 204.168.175.41', 'slash', false, false);
  assert.equal(l1.inBlock, true);
  assert.equal(l1.ranges[0][0], 0);
  const l2 = commentRanges('still inside 5.223.93.113', 'slash', false, true);
  assert.equal(l2.inBlock, true);
  assert.equal(l2.ranges[0][0], 0);
  const l3 = commentRanges('end */ live_code_after();', 'slash', false, true);
  assert.equal(l3.inBlock, false);
  assert.equal(l3.ranges[0][1], 'end */'.length, 'the closing range ends exactly at */');
});

test('commentRanges: PowerShell <# #> block only recognized when ps1=true', () => {
  const asPs1 = commentRanges('<# 204.168.175.41 #>', 'hash', true, false);
  assert.equal(asPs1.ranges[0][0], 0);
  assert.equal(asPs1.inBlock, false);
  const notPs1 = commentRanges('<# 204.168.175.41 #>', 'hash', false, false);
  assert.ok(notPs1.ranges.length === 0 || notPs1.ranges[0][0] > 0, 'without ps1 the <# is not a block start');
});

test('commentRanges: a `/*` inside a template literal or regex literal does not open a multi-line block (codex M3)', () => {
  const tpl = commentRanges('  throw new Error(`Expected image/* got ${x}`);', 'slash', false, false);
  assert.equal(tpl.inBlock, false, 'template literal');
  const rx = commentRanges("  const RE = /^[ \\t/*#-]*something/;", 'slash', false, false);
  assert.equal(rx.inBlock, false, 'regex literal');
  const real = commentRanges('  /* multi-line comment starts here', 'slash', false, false);
  assert.equal(real.inBlock, true, 'a comment that starts the line still opens');
  const inlineMid = commentRanges('x = 1; /* inline */ y = 2;', 'slash', false, false);
  assert.equal(inlineMid.ranges.length, 1, 'a mid-line block that closes on the same line is still a comment');
  assert.equal(inlineMid.inBlock, false);
});

test('scanText: an address on the line after a template literal containing /* is still live (codex M3)', () => {
  const found = scanText('lib/x.ts', '  const m = `image/* only`;\nconst HOST = "5.223.93.113";\n', RANGES);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test('scanText: a multi-line template literal whose inner line starts with /* does not hide later code (codex F2)', () => {
  const src = 'const banner = `\n/* not a comment, inside a string\nstill string`;\nconst HOST = "5.223.93.113";\nconst inner = `x ${y} 204.168.175.41`;\n';
  const found = scanText('lib/x.ts', src, RANGES);
  assert.deepEqual(found.map((f) => f.line), [4, 5], 'the assignment after the literal AND the address inside a literal are live');
});

test('scanText: a backtick inside an ordinary string does not open template state (codex r2 F1)', () => {
  const src = 'const q = "`";\n// 5.223.93.113 in a comment\nconst live = "204.168.175.41";\n';
  const found = scanText('lib/x.ts', src, RANGES);
  assert.deepEqual(found.map((f) => f.line), [3]);
});

test('classify: a knownViolations entry suppresses ONE line; a copied identical line is NEW (codex m6)', () => {
  const findings = [
    { file: 'compose.yml', line: 10, text: 'SG_SSH_HOST: 5.223.93.113', hits: ['x'], annotation: null },
    { file: 'compose.yml', line: 40, text: 'SG_SSH_HOST: 5.223.93.113', hits: ['x'], annotation: null },
  ];
  const cls = classify(findings, [{ file: 'compose.yml', line: 'SG_SSH_HOST: 5.223.93.113', task: 't' }]);
  assert.equal(cls.known.length, 1);
  assert.equal(cls.newViolations.length, 1);
});

test('HOST_SCRIPT: prints the real grep exit status (codex M2) and parses under bash -n', () => {
  assert.ok(HOST_SCRIPT.includes('@@GREP_EXIT=${PIPESTATUS[0]}'), 'no backslash before the $');
  assert.ok(!HOST_SCRIPT.includes('cut -c1-600'), 'no column cut that could drop an address');
  const r = spawnSync('bash', ['-n'], { input: HOST_SCRIPT, encoding: 'utf8' });
  if (r.error) return; // no bash on this machine: syntax check skipped, the string assertions above still ran
  assert.equal(r.status, 0, r.stderr);
});

test('MASK_SED: masks secrets but never an address value (codex M4)', () => {
  const input = [
    'DATABASE_URL=postgres://user:s3cret@5.223.93.113:5432/db',
    'RATE_LIMIT_BYPASS_IPS=5.223.93.113,204.168.175.41',
    'TLS_PASSTHROUGH_HOST: 204.168.175.41',
    'PRIVATE_NETWORK_PEER=2001:41d0:d:2572::1',
    'API_TOKEN=abc-Secret_9xz',
  ].join('\n') + '\n';
  const r = spawnSync('sed', ['-E', MASK_SED], { input, encoding: 'utf8' });
  if (r.error) return; // no sed on this machine
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout;
  assert.ok(out.includes('postgres://***@5.223.93.113:5432/db'), 'userinfo masked, host kept');
  assert.ok(out.includes('RATE_LIMIT_BYPASS_IPS=5.223.93.113,204.168.175.41'), 'BYPASS is not a secret key');
  assert.ok(out.includes('TLS_PASSTHROUGH_HOST: 204.168.175.41'), 'PASSTHROUGH is not a secret key');
  assert.ok(out.includes('PRIVATE_NETWORK_PEER=2001:41d0:d:2572::1'), 'an address value is never masked');
  assert.ok(out.includes('API_TOKEN=***'), 'a real secret value is masked');
});

test('commentRanges: quote-balance guard — a # inside a string is not a comment start', () => {
  const { ranges } = commentRanges('echo "value#204.168.175.41"', 'hash', false, false);
  assert.equal(ranges.length, 0, 'the only # is inside a balanced double-quoted string');
});

// ---------------------------------------------------------------- scanText

test('scanText: comment-only line is not a violation (comment line carries the address itself)', () => {
  const found = scanText('nginx/default.conf', '# EU VPS (204.168.175.41) monitoring — direct access\nset_real_ip_from 204.168.175.41/32;\n', RANGES);
  assert.equal(found.length, 1, 'only the live directive line 2; line 1 has the same address but only inside a comment');
  assert.equal(found[0].line, 2);
});

test('scanText: annotated line is reported but flagged with its reason', () => {
  const found = scanText('x.py', '"wordpress-ubuntu-4gb-sin-1 (5.223.93.113)" # released-ip-ok: historical incident record\n', RANGES);
  assert.equal(found.length, 1);
  assert.equal(found[0].annotation, 'historical incident record');
});

test('scanText: same-line inline comment after live code still flags the live part', () => {
  const found = scanText('deploy.sh', 'OFFSITE_HOST="${OFFSITE_HOST:-5.223.93.113}" # was SG\n', RANGES);
  assert.equal(found.length, 1);
});

// ---------------------------------------------------------------- classify

test('classify: splits new / known / annotated and flags stale known entries', () => {
  const findings = [
    { file: 'a.conf', line: 5, text: 'set_real_ip_from 204.168.175.41/32;', hits: ['x'] },
    { file: 'b.sh', line: 2, text: 'HOST=5.223.93.113', hits: ['x'], annotation: null },
    { file: 'c.py', line: 1, text: 'historic 5.223.93.113', hits: ['x'], annotation: 'historical record' },
  ];
  const known = [
    { file: 'b.sh', line: 'HOST=5.223.93.113', task: 'TASKS.md item' },
    { file: 'z.sh', line: 'nothing matches this anymore', task: 'stale item' },
  ];
  const cls = classify(findings, known);
  assert.equal(cls.newViolations.length, 1);
  assert.equal(cls.newViolations[0].file, 'a.conf');
  assert.equal(cls.known.length, 1);
  assert.equal(cls.known[0].task, 'TASKS.md item');
  assert.equal(cls.annotated.length, 1);
  assert.equal(cls.staleKnown.length, 1);
  assert.equal(cls.staleKnown[0].task, 'stale item');
});

// ---------------------------------------------------------------- inRepoScope

test('inRepoScope: docs/history/tests excluded; live code/config included; registry excludes itself', () => {
  assert.equal(inRepoScope('agency-os/WORKLOG.md'), false);
  assert.equal(inRepoScope('agency-os/reports/status/x.md'), false);
  assert.equal(inRepoScope('runbooks/FOO.md'), false);
  assert.equal(inRepoScope('docs/plan.md'), false);
  assert.equal(inRepoScope('tests/hooks/runner-parity.test.mjs'), false);
  assert.equal(inRepoScope('scripts/foo.test.mjs'), false);
  assert.equal(inRepoScope('agency-os/config/released-addresses.json'), false);
  assert.equal(inRepoScope('lobster-factory/infra/hetzner-phase1-core/nginx/default.conf'), true);
  assert.equal(inRepoScope('scripts/backup.sh'), true);
  assert.equal(inRepoScope('agency-os/config/other-thing.json'), true);
});

// ---------------------------------------------------------------- scanRepo (integration, synthetic git repo)

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'released-addr-test-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

test('scanRepo: end-to-end over a synthetic git repo finds only the live violation', () => {
  const dir = makeTempRepo();
  try {
    mkdirSync(join(dir, 'nginx'), { recursive: true });
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'nginx', 'default.conf'),
      '# EU VPS (204.168.175.41) monitoring\nset_real_ip_from 204.168.175.41/32;\n');
    writeFileSync(join(dir, 'docs', 'runbook.md'), 'ssh root@5.223.93.113 -- historical only\n');
    writeFileSync(join(dir, 'clean.sh'), 'echo "nothing released here"\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });

    const res = scanRepo(dir, RANGES);
    assert.equal(res.filesListed, 3);
    assert.equal(res.filesInScope, 2, 'docs/runbook.md is out of scope');
    const cls = classify(res.findings, []);
    assert.equal(cls.newViolations.length, 1);
    assert.equal(cls.newViolations[0].file, 'nginx/default.conf');
    assert.equal(cls.newViolations[0].line, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo: a knownViolations entry suppresses its exact line but not an edited one', () => {
  const dir = makeTempRepo();
  try {
    writeFileSync(join(dir, 'app.sh'), 'HOST="${HOST:-5.223.93.113}"\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
    const res = scanRepo(dir, RANGES);
    const known = [{ file: 'app.sh', line: 'HOST="${HOST:-5.223.93.113}"', task: 'tracked' }];
    const cls = classify(res.findings, known);
    assert.equal(cls.newViolations.length, 0);
    assert.equal(cls.known.length, 1);

    // now edit the line: the OLD known entry must stop matching (become NEW, not silently pass)
    writeFileSync(join(dir, 'app.sh'), 'HOST="${HOST:-5.223.93.113}"  # touched\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'edit'], { cwd: dir });
    const res2 = scanRepo(dir, RANGES);
    const cls2 = classify(res2.findings, known);
    assert.equal(cls2.newViolations.length, 1, 'an edited line must re-surface as NEW, not stay silently suppressed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanRepo: binary file with an address-shaped byte sequence is skipped, not misparsed', () => {
  const dir = makeTempRepo();
  try {
    const buf = Buffer.from('204.168.175.41\0\0\0binary junk', 'utf8');
    writeFileSync(join(dir, 'blob.bin'), buf);
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
    const res = scanRepo(dir, RANGES);
    assert.equal(res.findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- parseHostOutput

test('parseHostOutput: classifies live/backup/mirror lines and container env, requires @@DONE', () => {
  const stdout = [
    '/etc/nginx/conf.d/rate-limit-zones.conf:1:# EU VPS (204.168.175.41)',
    '/etc/nginx/sites-available/x.conf:9:set_real_ip_from 204.168.175.41/32;',
    '/root/lobster-phase1/.env.bak.safe-patch-20260901:7:N8N_HOST=5.223.93.113',
    '/opt/cognitive-os/agency-os/reports/x.md:3:5.223.93.113',
    '@@ENV lobster-next-admin SG_SSH_HOST=5.223.93.113',
    '@@GREP_EXIT=0',
    '@@DONE',
  ].join('\n');
  const parsed = parseHostOutput(stdout, RANGES);
  assert.equal(parsed.done, true);
  assert.equal(parsed.grepExit, 0);
  assert.equal(parsed.backups, 1);
  assert.equal(parsed.mirrors, 1);
  assert.equal(parsed.findings.length, 2, 'the live nginx directive + the container env, not the comment/backup/mirror lines');
  assert.ok(parsed.findings.some((f) => f.file.startsWith('container:')));
});

test('parseHostOutput: missing @@DONE signals an incomplete sweep', () => {
  const parsed = parseHostOutput('@@GREP_EXIT=0\n', RANGES);
  assert.equal(parsed.done, false);
});

// ---------------------------------------------------------------- ssh-config mode (2026-09-24)

test('parseSshConfig: concrete aliases with line numbers; wildcard / negated patterns skipped; Include captured', () => {
  const { hosts, includes } = parseSshConfig('# c\nHost old-sg old-alt\n  HostName 5.223.93.113\nHost * !skip\n  User x\nInclude conf.d/*.conf\n');
  assert.deepEqual(hosts, [{ alias: 'old-sg', line: 2, hostName: '5.223.93.113' }, { alias: 'old-alt', line: 2, hostName: '5.223.93.113' }]);
  assert.deepEqual(includes, ['conf.d/*.conf']);
});

test('hostnameFromSshG: reads the hostname line of `ssh -G` output', () => {
  assert.equal(hostnameFromSshG('user root\nhostname 5.223.93.113\nport 22\n'), '5.223.93.113');
  assert.equal(hostnameFromSshG(''), null);
});

const HAS_SSH = spawnSync('ssh', ['-V']).status === 0;

test('scanSshConfig: real `ssh -G` flags aliases resolving to released addresses (IP literal, DNS, Include)', { skip: !HAS_SSH && 'no ssh client' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssh-config-scan-'));
  try {
    const inc = join(dir, 'extra.conf').replace(/\\/g, '/');
    writeFileSync(inc, 'Host inc-eu\n  HostName 204.168.175.41\n');
    const cfg = join(dir, 'config');
    writeFileSync(cfg, [
      'Host old-sg', '  HostName 5.223.93.113', '  User root',
      'Host fine', '  HostName 10.9.8.7',
      'Host via-dns', '  HostName stale.example.invalid',
      'Host gone-dns', '  HostName nothing.example.invalid',
      'Host *', '  ServerAliveInterval 30',
      `Include ${inc}`, '',
    ].join('\n'));
    const resolveName = async (name) => {
      if (name === 'stale.example.invalid') return ['204.168.175.41'];
      throw new Error('ENOTFOUND');
    };
    const res = await scanSshConfig(cfg, RANGES, { resolveName });
    const flagged = res.findings.map((f) => f.text).sort();
    assert.deepEqual(flagged, ['Host inc-eu -> 204.168.175.41', 'Host old-sg -> 5.223.93.113', 'Host via-dns -> stale.example.invalid']);
    assert.equal(res.hosts, 5, 'old-sg, fine, via-dns, gone-dns, inc-eu');
    assert.ok(!res.findings.some((f) => f.text.includes('gone-dns')), 'a name that does not resolve fails closed: not a violation');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanSshConfig: no ssh client at all -> static HostName still checked (never silently blind)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssh-config-nossh-'));
  try {
    const cfg = join(dir, 'config');
    writeFileSync(cfg, 'Host old-eu\n  HostName 204.168.175.41\nHost fine\n  HostName 10.9.8.7\n');
    const sshG = () => { throw new Error('spawn ssh ENOENT'); };
    const res = await scanSshConfig(cfg, RANGES, { sshG, resolveName: async () => { throw new Error('x'); } });
    assert.deepEqual(res.findings.map((f) => f.text), ['Host old-eu -> 204.168.175.41']);
    assert.ok(res.findings.every((f) => f.line > 0 && f.file.startsWith('ssh-config:')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scanSshConfig: missing file is not an error and finds nothing', async () => {
  const res = await scanSshConfig(join(tmpdir(), 'no-such-ssh-config-' + Date.now()), RANGES);
  assert.equal(res.findings.length, 0);
  assert.equal(res.note, 'no ssh config file');
});

test('CLI --ssh-config: exit 1 and a NEW row for a released alias, exit 0 when clean', { skip: !HAS_SSH && 'no ssh client' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssh-config-cli-'));
  try {
    const bad = join(dir, 'bad'); writeFileSync(bad, 'Host old-sg\n  HostName 5.223.93.113\n');
    const good = join(dir, 'good'); writeFileSync(good, 'Host prod\n  HostName 10.9.8.7\n');
    const rb = spawnSync(process.execPath, [SCRIPT, '--ssh-config', bad], { encoding: 'utf8' });
    assert.equal(rb.status, 1, rb.stdout + rb.stderr);
    assert.match(rb.stdout, /NEW\s+ssh-config:.*Host old-sg -> 5\.223\.93\.113/);
    const rg = spawnSync(process.execPath, [SCRIPT, '--ssh-config', good], { encoding: 'utf8' });
    assert.equal(rg.status, 0, rg.stdout + rg.stderr);
    assert.match(rg.stdout, /RESULT: PASS new=0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
