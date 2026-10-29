<?php
/**
 * ADR 017 4c-3: the Ed25519 construction next-admin verifies for a reseller site (lib/payments/sites.ts), against the
 * vector shared with next-admin (tests/fixtures/ed25519-v1.json = lib/payments/__tests__/fixtures/ed25519-v1.json).
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\PaymentSender;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class SignatureTest extends TestCase {

	/** @return array<string,string> */
	private function vector(): array {
		return json_decode( (string) file_get_contents( __DIR__ . '/fixtures/ed25519-v1.json' ), true );
	}

	public function test_an_ed25519_signature_over_the_exact_bytes_verifies_against_the_fixture_public_key(): void {
		$v    = $this->vector();
		$pair = sodium_crypto_sign_seed_keypair( (string) hex2bin( $v['seed_hex'] ) );
		$this->assertSame( $v['public_key_raw_hex'], bin2hex( sodium_crypto_sign_publickey( $pair ) ) );
		$this->assertSame( $v['public_key_pem'], Signature::publicKeyPem( base64_encode( $pair ) ) );

		$sig = Signature::signWithKeypair( $v['body'], base64_encode( $pair ) );
		$this->assertSame( $v['signature_base64'], $sig );
		$this->assertTrue( sodium_crypto_sign_verify_detached( (string) base64_decode( $sig, true ), $v['body'], sodium_crypto_sign_publickey( $pair ) ) );
		// One byte different is a different message.
		$this->assertFalse( sodium_crypto_sign_verify_detached( (string) base64_decode( $sig, true ), $v['body'] . ' ', sodium_crypto_sign_publickey( $pair ) ) );
	}

	public function test_a_site_with_a_key_id_sends_it_in_the_header_and_never_sends_an_hmac(): void {
		$v        = $this->vector();
		$pair     = base64_encode( sodium_crypto_sign_seed_keypair( (string) hex2bin( $v['seed_hex'] ) ) );
		$secret   = 'awarewave-test-vector-secret-0123456789abcdef';
		$settings = new Settings( true, 'https://app.aware-wave.com', $secret, '', array(), 'test-site', $pair, '' );
		$http     = new FakeHttp( 200 );
		$job      = array( 'event_id' => 'wc:7', 'body' => $v['body'], 'note_id' => 7, 'attempt' => 0 );

		$this->assertSame( 'done', ( new PaymentSender( $http, new FakeQueue(), new FakeShop() ) )->deliver( $job, $settings ) );
		$headers = $http->requests[0]['headers'];
		$this->assertSame( 'test-site', $headers[ Signature::SITE_HEADER ] );
		$this->assertSame( $v['signature_base64'], $headers[ Signature::PAYMENT_HEADER ] );
		$this->assertNotSame( Signature::sign( $v['body'], $secret ), $headers[ Signature::PAYMENT_HEADER ] );

		// No key id = aware-wave.com: HMAC, and no site header.
		$http = new FakeHttp( 200 );
		( new PaymentSender( $http, new FakeQueue(), new FakeShop() ) )->deliver( $job, new Settings( true, 'https://app.aware-wave.com', $secret, '' ) );
		$this->assertArrayNotHasKey( Signature::SITE_HEADER, $http->requests[0]['headers'] );
		$this->assertSame( Signature::sign( $v['body'], $secret ), $http->requests[0]['headers'][ Signature::PAYMENT_HEADER ] );
	}

	public function test_regenerating_keys_invalidates_the_previous_signature(): void {
		$old = Signature::newKeypair();
		$new = Signature::newKeypair();
		$sig = (string) base64_decode( Signature::signWithKeypair( 'body', $old ), true );
		$this->assertTrue( sodium_crypto_sign_verify_detached( $sig, 'body', sodium_crypto_sign_publickey( (string) base64_decode( $old, true ) ) ) );
		$this->assertFalse( sodium_crypto_sign_verify_detached( $sig, 'body', sodium_crypto_sign_publickey( (string) base64_decode( $new, true ) ) ) );
	}
}
