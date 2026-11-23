<?php
/**
 * Resend webhook signature check (Resend signs with Svix: https://resend.com/docs/webhooks/verify-webhooks-requests,
 * https://docs.svix.com/receiving/verifying-payloads/how-manual). WP-free, unit-tested.
 *
 *   signed content = "<svix-id>.<svix-timestamp>.<raw body>"
 *   expected       = base64( HMAC-SHA256( base64_decode(secret without "whsec_"), signed content ) )
 *   svix-signature = space-separated "v1,<base64>" entries; one constant-time match is enough
 *   svix-timestamp within ±TOLERANCE seconds (replays outside the window fail here; inside it the
 *   caller de-duplicates by svix-id)
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

final class Svix {

	const TOLERANCE = 300;
	const ID_PATTERN = '/^[A-Za-z0-9_-]{1,100}$/';

	/** Raw HMAC key from "whsec_<base64>", or '' when the secret is not in that form. */
	public static function key( string $secret ): string {
		$secret = trim( $secret );
		if ( strpos( $secret, 'whsec_' ) !== 0 ) {
			return '';
		}
		$raw = base64_decode( substr( $secret, 6 ), true );
		return ( is_string( $raw ) && strlen( $raw ) >= 16 ) ? $raw : '';
	}

	public static function verify( string $secret, string $id, string $timestamp, string $signatures, string $body, int $now ): bool {
		$key = self::key( $secret );
		if ( $key === '' || ! preg_match( self::ID_PATTERN, $id ) || ! preg_match( '/^[0-9]{1,12}$/', $timestamp ) ) {
			return false;
		}
		if ( abs( $now - (int) $timestamp ) > self::TOLERANCE ) {
			return false;
		}
		$expected = base64_encode( hash_hmac( 'sha256', $id . '.' . $timestamp . '.' . $body, $key, true ) );
		foreach ( preg_split( '/\s+/', trim( $signatures ) ) as $entry ) {
			$parts = explode( ',', $entry, 2 );
			if ( count( $parts ) === 2 && $parts[0] === 'v1' && hash_equals( $expected, $parts[1] ) ) {
				return true;
			}
		}
		return false;
	}
}
