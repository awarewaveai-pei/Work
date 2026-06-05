<?php
/**
 * RequestAuthenticator — the full request gate: ties KeyStore + SignatureVerifier + NonceCache into
 * one decision. This is where the three auth bricks become a pipeline.
 *
 * Order is AUTHENTICATE-THEN-AUTHORIZE, and that order is a security property:
 *
 *   1. Resolve the key_id (need its public key to verify anything). An UNKNOWN key is reported with
 *      the SAME reason/status as a bad signature, so an attacker cannot enumerate which key_ids exist.
 *   2. Verify the Ed25519 signature + timestamp window. Only a holder of the private key passes. We
 *      do this BEFORE looking at status/IP/scope so those authorization facts never leak to a caller
 *      who hasn't first proven key ownership (no "is this key revoked?" oracle for unauthenticated
 *      probers).
 *   3. Only now authorize: key usable (revocation), IP allowlist, scope sufficient for the endpoint.
 *   4. Nonce LAST — a single-use nonce is only spent on a request that is already authentic AND
 *      authorized, so replay/DB-write cost isn't incurred for junk, and an expired nonce dies at the
 *      timestamp check in step 2 before ever reaching the store.
 *
 * Store outages (KeyStoreUnavailable / nonce store) fail CLOSED as HTTP 503. WP-free + unit-testable.
 *
 * @package AwareWave\WpBridge\Http
 */

namespace AwareWave\WpBridge\Http;

use AwareWave\WpBridge\Auth\KeyRecord;
use AwareWave\WpBridge\Auth\KeyStore;
use AwareWave\WpBridge\Auth\KeyStoreUnavailable;
use AwareWave\WpBridge\Auth\NonceCache;
use AwareWave\WpBridge\Auth\SignatureVerifier;

final class RequestAuthenticator {

	/** @var KeyStore */
	private $keys;
	/** @var SignatureVerifier */
	private $verifier;
	/** @var NonceCache */
	private $nonces;

	public function __construct( KeyStore $keys, SignatureVerifier $verifier, NonceCache $nonces ) {
		$this->keys     = $keys;
		$this->verifier = $verifier;
		$this->nonces   = $nonces;
	}

	/**
	 * @param string $requiredScope The scope the target endpoint needs: KeyRecord::SCOPE_READ for a
	 *                              read endpoint, anything else is treated as requiring WRITE (the
	 *                              safe default — an unrecognised requirement demands the higher bar).
	 * @param int    $now           Current unix time (injected so tests are deterministic).
	 */
	public function authenticate( SignedRequest $req, string $requiredScope, int $now ): AuthResult {
		// Fail CLOSED against ANY collaborator fault, not only the two typed store exceptions caught
		// below: an unexpected throwable from a store / the verifier must become a 503, never an
		// uncaught 500 (which is fail-indeterminate and leaks a stack-trace surface from an auth gate).
		try {
			return $this->decide( $req, $requiredScope, $now );
		} catch ( \Throwable $e ) {
			return AuthResult::deny( 'auth_unavailable', 503, 'internal_error' );
		}
	}

	private function decide( SignedRequest $req, string $requiredScope, int $now ): AuthResult {
		// 1. Resolve key. Unknown key -> same response as a bad signature (no enumeration oracle).
		try {
			$key = $this->keys->resolve( $req->keyId() );
		} catch ( KeyStoreUnavailable $e ) {
			return AuthResult::deny( 'key_store_unavailable', 503 );
		}
		if ( $key === null ) {
			return AuthResult::deny( 'unknown_or_bad_signature', 401 );
		}

		// 2. Verify signature + timestamp BEFORE revealing any authorization fact about the key.
		$sig = $this->verifier->verify(
			$key->publicKeyBase64(),
			$req->method(),
			$req->path(),
			$req->timestamp(),
			$req->nonce(),
			$req->body(),
			$req->signatureBase64(),
			$now
		);
		if ( ! $sig['valid'] ) {
			// ALL signature/timestamp failures collapse to ONE wire reason. In particular
			// timestamp_out_of_window must NOT be surfaced distinctly: SignatureVerifier checks the
			// timestamp before the crypto, so a stale timestamp on a KNOWN key returns that reason
			// regardless of signature validity — distinguishing it from an unknown key's generic 401
			// would be a key-existence oracle. The precise reason is kept for the audit log only;
			// legit clients diagnose clock skew via /health (which reports server time + skew).
			return AuthResult::deny( 'unknown_or_bad_signature', 401, $sig['reason'] );
		}

		// 3. Authenticated. Now authorize.
		if ( ! $key->isUsable() ) {
			return AuthResult::deny( 'key_revoked', 403 );
		}
		if ( ! $key->ipAllowed( $req->clientIp() ) ) {
			return AuthResult::deny( 'ip_not_allowed', 403 );
		}

		$needWrite = ( $requiredScope !== KeyRecord::SCOPE_READ );
		if ( $needWrite && ! $key->allowsWrite() ) {
			return AuthResult::deny( 'insufficient_scope', 403 );
		}
		if ( ! $needWrite && ! $key->allowsRead() ) {
			return AuthResult::deny( 'insufficient_scope', 403 );
		}

		// 4. Nonce last — spend single-use only on an authentic, authorized request.
		$nonce = $this->nonces->check( $req->nonce(), $req->timestamp() );
		if ( ! $nonce['fresh'] ) {
			switch ( $nonce['reason'] ) {
				case 'replayed':
					return AuthResult::deny( 'replayed', 401 );
				case 'store_unavailable':
					return AuthResult::deny( 'nonce_store_unavailable', 503 );
				default: // empty_nonce | nonce_too_long
					return AuthResult::deny( 'invalid_nonce', 400 );
			}
		}

		return AuthResult::ok( $key->keyId(), $key->scope() );
	}
}
