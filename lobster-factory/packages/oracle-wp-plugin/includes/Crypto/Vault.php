<?php
/**
 * Encryption of member birth data at rest (ORACLE-WP-SPEC §2-6). WP-free.
 *
 * libsodium secretbox (XSalsa20-Poly1305; WordPress ships sodium_compat). The key is 32 random bytes kept in
 * wp-config.php (constant AWORACLE_DATA_KEY, base64) — never in the database, so a database dump or backup
 * holds only ciphertext. Stored form: "v1." . base64(nonce . box).
 * The sealed JSON carries a context ("charts:<user id>") that open() checks: a blob copied into another
 * member's row or the other table does not decrypt there.
 *
 * @package AwareWave\Oracle\Crypto
 */

namespace AwareWave\Oracle\Crypto;

final class Vault {

	const PREFIX = 'v1.';

	/** Raw 32-byte key from its base64 form, or '' when it is not exactly that. */
	public static function keyFromBase64( string $b64 ): string {
		$raw = base64_decode( trim( $b64 ), true );
		return ( is_string( $raw ) && strlen( $raw ) === SODIUM_CRYPTO_SECRETBOX_KEYBYTES ) ? $raw : '';
	}

	public static function newKeyBase64(): string {
		return base64_encode( random_bytes( SODIUM_CRYPTO_SECRETBOX_KEYBYTES ) );
	}

	/**
	 * @param array<string,mixed> $data
	 * @throws \InvalidArgumentException unusable key or data not encodable as JSON
	 */
	public static function seal( array $data, string $key, string $context ): string {
		if ( strlen( $key ) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES ) {
			throw new \InvalidArgumentException( 'data key not configured' );
		}
		try {
			$plain = json_encode( array( 'c' => $context, 'd' => $data ), JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR );
		} catch ( \JsonException $e ) {
			throw new \InvalidArgumentException( 'data not encodable as JSON', 0, $e );
		}
		$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		return self::PREFIX . base64_encode( $nonce . sodium_crypto_secretbox( $plain, $nonce, $key ) );
	}

	/**
	 * The sealed data, or null: wrong key, tampered or truncated blob, unknown format, or another context.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function open( string $blob, string $key, string $context ): ?array {
		if ( strlen( $key ) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES || strpos( $blob, self::PREFIX ) !== 0 ) {
			return null;
		}
		$raw = base64_decode( substr( $blob, strlen( self::PREFIX ) ), true );
		if ( ! is_string( $raw ) || strlen( $raw ) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES ) {
			return null;
		}
		try {
			$plain = sodium_crypto_secretbox_open(
				substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ),
				substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ),
				$key
			);
		} catch ( \SodiumException $e ) {
			return null;
		}
		if ( ! is_string( $plain ) ) {
			return null;
		}
		$decoded = json_decode( $plain, true );
		if ( ! is_array( $decoded ) || ( $decoded['c'] ?? null ) !== $context || ! is_array( $decoded['d'] ?? null ) ) {
			return null;
		}
		return $decoded['d'];
	}
}
