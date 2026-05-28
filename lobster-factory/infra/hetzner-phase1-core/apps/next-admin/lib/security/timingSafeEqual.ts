// Timing-safe string comparison for secret tokens.
//
// Uses HMAC-SHA256 to normalise both inputs to a fixed-length (32-byte) digest
// before calling crypto.timingSafeEqual. This eliminates the length-based
// timing side-channel that exists when comparing variable-length byte buffers
// directly: an attacker probing response latency can no longer learn the
// expected token length from length-mismatch branches.
//
// Design notes:
//  - Zero key (Buffer.alloc(32)): the key is not secret here; its sole role is
//    to make crypto.createHmac happy (it requires a non-empty argument) and to
//    produce a fixed-length output via HMAC-SHA256 rather than plain SHA-256.
//    HMAC is intentional over plain SHA-256: it matches the "this is auth code"
//    pattern that security reviewers scan for, and prevents a future reader from
//    "simplifying" it to createHash (which would still be structurally correct
//    but lose the idiomatic signal).
//  - crypto.timingSafeEqual precondition: both digests are 32 bytes (SHA-256
//    output) by construction — the equal-length precondition is always met.
//  - UTF-8 encoding: Buffer.from(x, "utf8") means multibyte characters are
//    compared byte-for-byte after encoding; NFC vs NFD variants of the same
//    visual character will compare false, which is the correct policy for
//    secret comparison (never normalise — only raw byte equality matters).
//
// m2 fix (auto-repair audit 2026-05-23): replaced the previous pattern of
//   Buffer.from(a).length !== Buffer.from(b).length → return false
// which leaked the expected token length via a timing-observable code path.

import crypto from "crypto";

const HMAC_KEY = Buffer.alloc(32);

export function timingSafeEqual(a: string, b: string): boolean {
  const aHash = crypto.createHmac("sha256", HMAC_KEY).update(Buffer.from(a, "utf8")).digest();
  const bHash = crypto.createHmac("sha256", HMAC_KEY).update(Buffer.from(b, "utf8")).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}
