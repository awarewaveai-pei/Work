// Tests for scripts/fetch-ssh-host-key-fingerprint.mjs. Run: node --test tests/scripts/fetch-ssh-host-key-fingerprint.test.mjs
// Fixture = ks-aw-01's public ed25519 host key (ssh-keyscan -p 58122 145.239.195.47, 2026-09-23). Expected values
// were produced by two OTHER tool chains: hex by `ssh-keyscan | cut | base64 -d | sha256sum` on the host itself,
// base64 by `ssh-keygen -lf` on the same keyscan line -- so a wrong digest here cannot agree with both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestKeyscanLine, pickNegotiated, main, SSH2_HOSTKEY_PREFERENCE } from '../../scripts/fetch-ssh-host-key-fingerprint.mjs';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'fetch-ssh-host-key-fingerprint.mjs');

const KS_AW_01_ED25519 =
  '[145.239.195.47]:58122 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHWNY5o/h+yTcIB8ZtsImAyqdA5XlfIHd1bWzq1zvWN3';
const KS_AW_01_HEX = '549880f6af33d02b58bbbe4ec0501086e1d512c822d021a0c6e3a8e5667973b5';
const KS_AW_01_OPENSSH = 'SHA256:VJiA9q8z0CtYu75OwFAQhuHVEsgi0CGgxuOo5WZ5c7U';

test('digestKeyscanLine: ks-aw-01 ed25519 line -> ssh2 hex and ssh-keygen -lf base64 agree', () => {
  const e = digestKeyscanLine(KS_AW_01_ED25519);
  assert.deepEqual(e, { type: 'ssh-ed25519', hex: KS_AW_01_HEX, openssh: KS_AW_01_OPENSSH });
});

test('digestKeyscanLine: comments, blanks, short and non-base64 lines are ignored', () => {
  assert.equal(digestKeyscanLine('# 145.239.195.47:58122 SSH-2.0-OpenSSH_9.6p1'), null);
  assert.equal(digestKeyscanLine(''), null);
  assert.equal(digestKeyscanLine('   '), null);
  assert.equal(digestKeyscanLine('[h]:22 ssh-ed25519'), null);
  assert.equal(digestKeyscanLine('[h]:22 ssh-ed25519 not*base64!'), null);
  assert.equal(digestKeyscanLine(undefined), null);
});

test('pickNegotiated: ed25519 wins over ecdsa and rsa whatever the order; rsa-only pins ssh-rsa; none -> null', () => {
  const rsa = { type: 'ssh-rsa', hex: 'r', openssh: 'r' };
  const ecdsa = { type: 'ecdsa-sha2-nistp256', hex: 'e', openssh: 'e' };
  const ed = { type: 'ssh-ed25519', hex: 'd', openssh: 'd' };
  assert.equal(pickNegotiated([rsa, ecdsa, ed]), ed);
  assert.equal(pickNegotiated([rsa, ecdsa]), ecdsa);
  assert.equal(pickNegotiated([rsa]), rsa);
  assert.equal(pickNegotiated([{ type: 'ssh-dss', hex: 'x', openssh: 'x' }]), null);
  assert.equal(pickNegotiated([]), null);
  assert.equal(SSH2_HOSTKEY_PREFERENCE[0], 'ssh-ed25519');
});

test('main: prints every offered key, marks the pinned one, emits the env line, exit 0', () => {
  let out = '';
  let err = '';
  const rc = main(['145.239.195.47', '58122'], {
    keyscan: (host, port) => {
      assert.equal(host, '145.239.195.47');
      assert.equal(port, 58122);
      return `# banner\n${KS_AW_01_ED25519}\n[145.239.195.47]:58122 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC5\n`;
    },
    stdout: (s) => { out += s; },
    stderr: (s) => { err += s; },
  });
  assert.equal(rc, 0);
  assert.equal(err, '');
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], `* ssh-ed25519 ${KS_AW_01_HEX} ${KS_AW_01_OPENSSH}`);
  assert.match(lines[1], /^  ssh-rsa [0-9a-f]{64} SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(lines[2], `AUTO_REPAIR_<SG|EU>_SSH_HOST_KEY_SHA256=${KS_AW_01_HEX}`);
});

test('main: empty keyscan -> exit 1; bad usage -> exit 2; nothing printed on stdout', () => {
  let out = '';
  let err = '';
  const io = { stdout: (s) => { out += s; }, stderr: (s) => { err += s; } };
  assert.equal(main(['h', '22'], { ...io, keyscan: () => '' }), 1);
  assert.equal(main([], io), 2);
  assert.equal(main(['h', '70000'], io), 2);
  assert.equal(main(['h', 'abc'], io), 2);
  assert.equal(out, '');
  assert.match(err, /no host key/);
  assert.match(err, /usage:/);
});

test('CLI: importing the module does not run main; direct invocation with no args exits 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});
