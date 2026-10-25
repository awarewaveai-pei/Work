<?php
/**
 * The one signature construction next-admin verifies for payment events and door handoffs
 * (lib/payments/hmac.ts signPayment): base64(HMAC-SHA256(raw body, secret)). Sign the exact bytes sent.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class Signature {

	const PAYMENT_HEADER = 'X-AwareWave-Payment-Signature';
	const HANDOFF_HEADER = 'X-AwareWave-Handoff-Signature';

	public static function sign( string $rawBody, string $secret ): string {
		return base64_encode( hash_hmac( 'sha256', $rawBody, $secret, true ) );
	}
}
