<?php
/**
 * NonceCache — replay protection coordinator. Turns a NonceStore into a request-level verdict.
 *
 * Pipeline position (the order is a security property, not a convenience):
 *   1. SignatureVerifier::verify()  — is the request authentic AND within the timestamp window?
 *   2. NonceCache::check()          — has this (authentic, in-window) nonce been spent already?
 * Nonce is checked LAST so a DB write is only ever spent on a request that already proved authentic
 * and fresh-in-time. It also means an expired-nonce replay dies at step 1 (timestamp) and never
 * reaches the store, so store GC cannot reopen a replay hole.
 *
 * Responsibilities kept here (thin on purpose):
 *   - Reject structurally invalid nonces (empty / over-long) before touching storage.
 *   - Derive the GC expiry from the request timestamp + the same window the verifier uses.
 *   - FAIL CLOSED: a store outage (NonceStoreUnavailable) becomes a rejection, never a silent pass.
 *   - Return a structured verdict so the router maps each outcome to the right HTTP status + audit reason.
 *
 * Atomic single-use itself is delegated to the NonceStore implementation (its documented invariant).
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class NonceCache {

	/**
	 * Upper bound on accepted nonce length, in BYTES (the limit is enforced with strlen(), a byte
	 * count — NOT mb_strlen — because it must match WpdbNonceStore's VARBINARY byte capacity exactly).
	 * A nonce only needs ~128 bits of entropy (~22 base64url bytes); 256 is generous headroom while
	 * stopping a caller from using the store as a blob dump. MUST be <= WpdbNonceStore::NONCE_COLUMN_BYTES.
	 */
	public const MAX_NONCE_LENGTH = 256;

	/** @var NonceStore */
	private $store;

	/** @var int Must match the SignatureVerifier window so a nonce row outlives the request's validity. */
	private $windowSeconds;

	public function __construct( NonceStore $store, int $windowSeconds = SignatureVerifier::DEFAULT_WINDOW_SECONDS ) {
		$this->store = $store;
		// A zero/negative window would expire nonce rows immediately — guard like SignatureVerifier does.
		$this->windowSeconds = $windowSeconds > 0 ? $windowSeconds : SignatureVerifier::DEFAULT_WINDOW_SECONDS;
	}

	/**
	 * Is this nonce fresh (first use) for the given request timestamp?
	 *
	 * @param int $timestamp The request's signed timestamp (same value the signature is bound to).
	 *                       Used only to compute the GC expiry, NOT to decide freshness.
	 *
	 * @return array{fresh:bool, reason:string} reason is one of:
	 *   'ok'                — first use, request may proceed
	 *   'empty_nonce'       — structurally invalid, rejected before storage
	 *   'nonce_too_long'    — exceeds MAX_NONCE_LENGTH, rejected before storage
	 *   'replayed'          — already spent, reject (the core replay block)
	 *   'store_unavailable' — store could not prove freshness; FAILED CLOSED (reject)
	 */
	public function check( string $nonce, int $timestamp ): array {
		if ( $nonce === '' ) {
			return array( 'fresh' => false, 'reason' => 'empty_nonce' );
		}
		if ( strlen( $nonce ) > self::MAX_NONCE_LENGTH ) {
			return array( 'fresh' => false, 'reason' => 'nonce_too_long' );
		}

		$expiresAt = $timestamp + $this->windowSeconds;

		try {
			$fresh = $this->store->remember( $nonce, $expiresAt );
		} catch ( NonceStoreUnavailable $e ) {
			// Cannot prove freshness -> reject. Never assume fresh on a store outage.
			return array( 'fresh' => false, 'reason' => 'store_unavailable' );
		}

		return $fresh
			? array( 'fresh' => true, 'reason' => 'ok' )
			: array( 'fresh' => false, 'reason' => 'replayed' );
	}
}
