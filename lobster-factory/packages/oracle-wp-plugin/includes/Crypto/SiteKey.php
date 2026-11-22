<?php
/**
 * The site's Ed25519 key: the private half stays on this site (option or wp-config constant), the engine
 * holds only the public half (its site registry). Same construction as aware-wave-store Signature.php
 * (signWithKeypair, publicKeyPem). WordPress ships sodium_compat, so this works without ext-sodium too. WP-free.
 *
 * Request format = engine ziwei-doushu lib/sites/verify.ts:
 *   body   JSON object: key_id, ts (unix seconds, ±60 s), nonce (16–100 of [A-Za-z0-9_-], once per site),
 *          aud ("v1" for /api/v1 incl. batch, "ticket" for member tickets), then the request fields
 *   header X-AwareWave-Oracle-Signature: base64(Ed25519(the exact body bytes))
 * Build every signed body with signedRequest(): callers pass the purpose, never the auth fields.
 *
 * @package AwareWave\Oracle\Crypto
 */

namespace AwareWave\Oracle\Crypto;

use AwareWave\Oracle\Settings\Normalize;

final class SiteKey {

	const SIGNATURE_HEADER = 'X-AwareWave-Oracle-Signature';

	/** Signed-body purposes the engine accepts (SiteAudience in verify.ts). */
	const AUD_V1     = 'v1';
	const AUD_TICKET = 'ticket';
	const AUTH_FIELDS = array( 'key_id', 'ts', 'nonce', 'aud' );

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

	/**
	 * The one way to build a signed request: auth fields first, then $payload.
	 *
	 * @param array<string,mixed> $payload request fields; must not contain key_id, ts, nonce or aud
	 * @return array{body:string,headers:array<string,string>}
	 * @throws \InvalidArgumentException unknown purpose, payload carrying an auth field, unusable key
	 */
	public static function signedRequest( array $payload, string $aud, string $keyId, string $stored, ?int $now = null ): array {
		if ( $aud !== self::AUD_V1 && $aud !== self::AUD_TICKET ) {
			throw new \InvalidArgumentException( 'unknown audience' );
		}
		foreach ( self::AUTH_FIELDS as $field ) {
			if ( array_key_exists( $field, $payload ) ) {
				throw new \InvalidArgumentException( 'payload must not carry ' . $field );
			}
		}
		if ( Normalize::keyId( $keyId ) !== $keyId || $keyId === '' || ! self::usable( $stored ) ) {
			throw new \InvalidArgumentException( 'site key not configured' );
		}
		$auth = array(
			'key_id' => $keyId,
			'ts'     => $now ?? time(),
			'nonce'  => rtrim( strtr( base64_encode( random_bytes( 24 ) ), '+/', '-_' ), '=' ),
			'aud'    => $aud,
		);
		try {
			$body = json_encode( $auth + $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR );
		} catch ( \JsonException $e ) {
			throw new \InvalidArgumentException( 'payload not encodable as JSON (invalid UTF-8?)', 0, $e );
		}
		return array(
			'body'    => $body,
			'headers' => array(
				'Content-Type'         => 'application/json',
				self::SIGNATURE_HEADER => self::sign( $body, $stored ),
			),
		);
	}

	/** The public half as SPKI PEM — what the engine's site registry stores. */
	public static function publicKeyPem( string $stored ): string {
		$pk   = sodium_crypto_sign_publickey( (string) base64_decode( $stored, true ) );
		$body = chunk_split( base64_encode( (string) hex2bin( self::SPKI_PREFIX_HEX ) . $pk ), 64, "\n" );
		return "-----BEGIN PUBLIC KEY-----\n" . $body . "-----END PUBLIC KEY-----\n";
	}
}
