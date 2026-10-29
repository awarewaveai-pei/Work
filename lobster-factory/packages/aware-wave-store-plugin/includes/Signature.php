<?php
/**
 * The signature constructions next-admin verifies for payment events and door handoffs.
 * aware-wave.com (no key id): base64(HMAC-SHA256(raw body, secret)) (lib/payments/hmac.ts signPayment).
 * A reseller site (has a key id): base64(Ed25519(raw body)) with the site's own private key, sent with
 * X-AwareWave-Site: <key_id>; next-admin holds only the public key (lib/payments/sites.ts). Sign the exact bytes sent.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class Signature {

	const PAYMENT_HEADER = 'X-AwareWave-Payment-Signature';
	const HANDOFF_HEADER = 'X-AwareWave-Handoff-Signature';
	const SITE_HEADER    = 'X-AwareWave-Site';

	/** DER SubjectPublicKeyInfo prefix of an Ed25519 public key; the 32 raw bytes follow. */
	const SPKI_PREFIX_HEX = '302a300506032b6570032100';

	public static function sign( string $rawBody, string $secret ): string {
		return base64_encode( hash_hmac( 'sha256', $rawBody, $secret, true ) );
	}

	/** @param string $secretKey 64 raw bytes (sodium secret key) */
	public static function signEd25519( string $rawBody, string $secretKey ): string {
		return base64_encode( sodium_crypto_sign_detached( $rawBody, $secretKey ) );
	}

	/** A new keypair, stored as base64 of sodium's 96-byte keypair string. */
	public static function newKeypair(): string {
		return base64_encode( sodium_crypto_sign_keypair() );
	}

	public static function keypairUsable( string $stored ): bool {
		$raw = base64_decode( $stored, true );
		return is_string( $raw ) && strlen( $raw ) === SODIUM_CRYPTO_SIGN_KEYPAIRBYTES;
	}

	/** Ed25519 signature over $rawBody with the secret half of a stored keypair. */
	public static function signWithKeypair( string $rawBody, string $storedKeypair ): string {
		return self::signEd25519( $rawBody, sodium_crypto_sign_secretkey( (string) base64_decode( $storedKeypair, true ) ) );
	}

	/** The public half as SPKI PEM, the form /ops/sellers takes. */
	public static function publicKeyPem( string $storedKeypair ): string {
		$pk = sodium_crypto_sign_publickey( (string) base64_decode( $storedKeypair, true ) );
		$body = chunk_split( base64_encode( (string) hex2bin( self::SPKI_PREFIX_HEX ) . $pk ), 64, "\n" );
		return "-----BEGIN PUBLIC KEY-----\n" . $body . "-----END PUBLIC KEY-----\n";
	}
}
