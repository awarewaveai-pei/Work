<?php
/**
 * SignatureVerifier — Ed25519 request authentication for the bridge.
 *
 * This is the security spine. It replaces HTTP Basic Auth (where a static shared secret travels
 * on every request and can leak via logs / Referer / browser history) with a per-request
 * asymmetric signature.
 *
 * Why asymmetric (Ed25519) rather than a shared HMAC secret:
 *   - The bridge plugin (running on the client's WordPress site) stores ONLY the PUBLIC key.
 *   - The controller (our SaaS control plane / the operator's SDK) holds the PRIVATE key, kept
 *     in a secrets vault and never sent to the site.
 *   - Therefore a full compromise of a customer's WordPress site yields only a public key —
 *     it CANNOT be used to forge writes. With a shared secret (HMAC/Basic), stealing the
 *     server's copy lets you forge everything. This is the decisive difference.
 *
 * The signature is bound to the method, path, timestamp, nonce, and a hash of the body, so a
 * captured signature cannot be replayed against a different operation, and is time-boxed
 * (timestamp window) + single-use (nonce, enforced by a collaborator) so it cannot be replayed
 * against the same operation either.
 *
 * This class is intentionally free of WordPress dependencies so it can be unit-tested in
 * isolation. It relies only on libsodium, which is bundled in PHP 7.2+ (and PHP 8.x).
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class SignatureVerifier {

	/** Default clock-skew tolerance, in seconds, between client timestamp and server time. */
	public const DEFAULT_WINDOW_SECONDS = 300;

	/** @var int Allowed absolute difference between request timestamp and "now", in seconds. */
	private $windowSeconds;

	public function __construct( int $windowSeconds = self::DEFAULT_WINDOW_SECONDS ) {
		// Guard against a zero/negative window silently disabling the time check.
		$this->windowSeconds = $windowSeconds > 0 ? $windowSeconds : self::DEFAULT_WINDOW_SECONDS;
	}

	/**
	 * Build the canonical string that the client signs and the server verifies.
	 *
	 * Format (newline-separated; the order IS part of the contract):
	 *   METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256(body)
	 *
	 * - METHOD is upper-cased so "post" and "POST" never produce different signatures by accident.
	 * - PATH is the request path WITHOUT scheme/host and WITHOUT any query secret, so the signature
	 *   is bound to the exact operation the route is registered under.
	 * - body is hashed (not embedded raw) so large/binary bodies stay cheap and safe to canonicalise.
	 */
	public function canonicalString( string $method, string $path, int $timestamp, string $nonce, string $body ): string {
		$bodyHash = hash( 'sha256', $body );
		return strtoupper( $method ) . "\n" . $path . "\n" . $timestamp . "\n" . $nonce . "\n" . $bodyHash;
	}

	/**
	 * Is the presented timestamp within the allowed clock-skew window relative to $now?
	 *
	 * Rejecting out-of-window timestamps bounds the replay surface: a captured request is only
	 * usable until its timestamp ages out of the window, and the nonce check kills reuse inside it.
	 */
	public function timestampWithinWindow( int $timestamp, int $now ): bool {
		return abs( $now - $timestamp ) <= $this->windowSeconds;
	}

	/**
	 * Verify a presented Ed25519 signature over the canonical request.
	 *
	 * Returns a structured result (not a bare bool) so the caller can map each failure to the
	 * right HTTP status and audit reason. This method does NOT check nonce reuse (that needs
	 * stateful storage — NonceCache's job) and does NOT look up the key (KeyStore resolves
	 * key_id -> public key first).
	 *
	 * @param string $publicKeyBase64    The site-stored Ed25519 public key, base64-encoded (32 raw bytes).
	 * @param string $signatureBase64    The client-presented signature, base64-encoded (64 raw bytes).
	 * @return array{valid:bool, reason:string} reason is one of:
	 *   'ok' | 'timestamp_out_of_window' | 'empty_signature' | 'malformed_key'
	 *   | 'malformed_signature' | 'signature_mismatch'
	 */
	public function verify(
		string $publicKeyBase64,
		string $method,
		string $path,
		int $timestamp,
		string $nonce,
		string $body,
		string $signatureBase64,
		int $now
	): array {
		if ( $signatureBase64 === '' ) {
			return array( 'valid' => false, 'reason' => 'empty_signature' );
		}

		// Check the clock first so we never spend a crypto verify on a stale request.
		if ( ! $this->timestampWithinWindow( $timestamp, $now ) ) {
			return array( 'valid' => false, 'reason' => 'timestamp_out_of_window' );
		}

		$publicKey = base64_decode( $publicKeyBase64, true );
		if ( $publicKey === false || strlen( $publicKey ) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES ) {
			return array( 'valid' => false, 'reason' => 'malformed_key' );
		}

		$signature = base64_decode( $signatureBase64, true );
		if ( $signature === false || strlen( $signature ) !== SODIUM_CRYPTO_SIGN_BYTES ) {
			return array( 'valid' => false, 'reason' => 'malformed_signature' );
		}

		$canonical = $this->canonicalString( $method, $path, $timestamp, $nonce, $body );

		// sodium_crypto_sign_verify_detached is constant-time and the canonical way to verify
		// a detached Ed25519 signature. It returns true only for a signature that the matching
		// private key produced over exactly this message.
		$ok = sodium_crypto_sign_verify_detached( $signature, $canonical, $publicKey );

		return $ok
			? array( 'valid' => true, 'reason' => 'ok' )
			: array( 'valid' => false, 'reason' => 'signature_mismatch' );
	}
}
