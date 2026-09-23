#!/usr/bin/env node
// fetch-ssh-host-key-fingerprint.mjs -- the value for AUTO_REPAIR_<SG|EU>_SSH_HOST_KEY_SHA256.
//
// next-admin lib/repair-center/ssh.ts pins the host key with ssh2's `hostHash:'sha256'`, which is
// hex(sha256(raw host-key blob)) (ssh2 lib/client.js: createHash(hashAlgo).update(key).digest('hex')).
// `ssh-keygen -lf` prints the SAME digest base64-encoded ("SHA256:..."); both are printed here so the
// operator can cross-check against `ssh-keyscan -p <port> <host> | ssh-keygen -lf -` before pasting.
//
// usage: node scripts/fetch-ssh-host-key-fingerprint.mjs <host> [port]
// output: one line per key type the server offers: `<type> <hex> <SHA256:base64>`; the line marked `*`
// is the key ssh2 negotiates by default (first of its serverHostKey preference that the server offers),
// i.e. the one to pin. Exit 1 when ssh-keyscan returns nothing (host down, port wrong, no ssh-keyscan).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ssh2 lib/protocol/constants.js DEFAULT_SERVER_HOST_KEY (ssh-ed25519 unshifted when eddsaSupported,
// true on every Node this repo runs). rsa-sha2-* are signature algorithms over the same `ssh-rsa` blob,
// so they map to the ssh-rsa key line ssh-keyscan prints.
export const SSH2_HOSTKEY_PREFERENCE = [
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'rsa-sha2-512',
  'rsa-sha2-256',
  'ssh-rsa',
];
const KEYSCAN_TYPE_FOR = { 'rsa-sha2-512': 'ssh-rsa', 'rsa-sha2-256': 'ssh-rsa' };

// `[host]:port ssh-ed25519 AAAA... [comment]` -> { type, hex, openssh } ; comments / blanks -> null
export function digestKeyscanLine(line) {
  const t = String(line ?? '').trim();
  if (!t || t.startsWith('#')) return null;
  const parts = t.split(/\s+/);
  if (parts.length < 3) return null;
  const [, type, b64] = parts;
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  const blob = Buffer.from(b64, 'base64');
  if (blob.length === 0) return null;
  const digest = createHash('sha256').update(blob).digest();
  return {
    type,
    hex: digest.toString('hex'),
    openssh: `SHA256:${digest.toString('base64').replace(/=+$/, '')}`,
  };
}

// The entry ssh2 would pin: first preference the server offers; null when none match.
export function pickNegotiated(entries) {
  for (const pref of SSH2_HOSTKEY_PREFERENCE) {
    const want = KEYSCAN_TYPE_FOR[pref] ?? pref;
    const hit = entries.find((e) => e.type === want);
    if (hit) return hit;
  }
  return null;
}

export function runKeyscan(host, port) {
  const r = spawnSync('ssh-keyscan', ['-p', String(port), '-T', '10', host], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return r.stdout ?? '';
}

export function main(argv, deps = {}) {
  const keyscan = deps.keyscan ?? runKeyscan;
  const out = deps.stdout ?? ((s) => process.stdout.write(s));
  const err = deps.stderr ?? ((s) => process.stderr.write(s));
  const [host, portArg] = argv;
  const port = Number(portArg ?? 22);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    err('usage: node scripts/fetch-ssh-host-key-fingerprint.mjs <host> [port]\n');
    return 2;
  }
  const entries = keyscan(host, port).split('\n').map(digestKeyscanLine).filter(Boolean);
  if (entries.length === 0) {
    err(`no host key from ssh-keyscan for ${host}:${port} (host down, wrong port, or ssh-keyscan missing)\n`);
    return 1;
  }
  const pin = pickNegotiated(entries);
  for (const e of entries) out(`${e === pin ? '*' : ' '} ${e.type} ${e.hex} ${e.openssh}\n`);
  if (pin) out(`AUTO_REPAIR_<SG|EU>_SSH_HOST_KEY_SHA256=${pin.hex}\n`);
  else err('server offers no key type ssh2 negotiates by default -- nothing to pin\n');
  return pin ? 0 : 1;
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
