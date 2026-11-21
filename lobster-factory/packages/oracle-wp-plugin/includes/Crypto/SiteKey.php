<?php
/**
 * The site's Ed25519 key: the private half stays in this site's options, the engine holds only the
 * public half (its site registry). Same construction as aware-wave-store Signature.php (signWithKeypair,
 * publicKeyPem) so both engines verify one format. WordPress ships sodium_compat, so this works without
 * ext-sodium too. WP-free.
 *
 * @package AwareWave\Oracle\Crypto
 */

namespace AwareWave\Oracle\Crypto;

final class SiteKey {

	/** Header naming the signing site; the engine looks the key id up in its registry. */
	const SITE_HEADER = 'X-AwareWave-Site';
	/** Header carrying base64(Ed25519(raw body)). */
	const SIGNATURE_HEADER = 'X-AwareWave-Site-Signature';

	/** DER SubjectPublicKeyInfo prefix of an Ed25519 public key; the 32 raw bytes follow. */
	const SPKI_PREFIX_HEX = '302a300506032b6570032100';

	/** A new keypair, stored as base64 of sodium's 96-byte keypair string. */
	public static function newKeypair(): string {
		return base64_encode( sodium_crypto_sign_keypair() );
	}

	public static function usable( string $stored ): bool {
		$raw = base64_decode( $stored, true );
		return is_string( $raw ) && strlen( $raw ) === SODIUM_CRYPTO_SIGN_KEYPAIRBYTES;
	}

	/** base64(Ed25519) over the exact bytes that will be sent. */
	public static function sign( string $rawBody, string $stored ): string {
		$secret = sodium_crypto_sign_secretkey( (string) base64_decode( $stored, true ) );
		return base64_encode( sodium_crypto_sign_detached( $rawBody, $secret ) );
	}

	/** The public half as SPKI PEM — what the engine's site registry stores. */
	public static function publicKeyPem( string $stored ): string {
		$pk   = sodium_crypto_sign_publickey( (string) base64_decode( $stored, true ) );
		$body = chunk_split( base64_encode( (string) hex2bin( self::SPKI_PREFIX_HEX ) . $pk ), 64, "\n" );
		return "-----BEGIN PUBLIC KEY-----\n" . $body . "-----END PUBLIC KEY-----\n";
	}
}
