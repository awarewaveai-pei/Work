<?php
/**
 * KeyStore — resolves a request's key_id to the KeyRecord the site holds for it.
 *
 * This runs BEFORE SignatureVerifier: the request names a key_id, the store returns the matching
 * public key + scope + status, and only then does the verifier check the signature against that
 * public key. Separating "which key" (KeyStore) from "is the signature valid" (SignatureVerifier)
 * keeps each piece single-purpose and unit-testable.
 *
 * Rotation falls out for free: several keys can be registered at once (old one STATUS_RETIRING, new
 * one STATUS_ACTIVE), and each request simply resolves by its own key_id. Revocation is a status
 * flip — resolve() still returns the record so the caller can audit a revoked-key attempt, but
 * KeyRecord::isUsable() reports false.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

interface KeyStore {

	/**
	 * Look up the KeyRecord for a key_id.
	 *
	 * @return KeyRecord|null the record, or null if no key with this id is registered (an UNKNOWN
	 *         key — the caller rejects as unauthorized). null is the "not found" answer, distinct
	 *         from a store failure.
	 *
	 * @throws KeyStoreUnavailable if the backing store cannot be reached. Callers MUST fail closed
	 *         (reject) — never treat an outage as "key not found" in a way that could be probed, and
	 *         never as "allow".
	 */
	public function resolve( string $keyId ): ?KeyRecord;
}
