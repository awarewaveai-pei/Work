<?php
/**
 * Unit tests for SignatureVerifier — the Ed25519 security spine.
 *
 * Retro-committed so DESIGN §G's "provable correctness" claim is backed by reproducible tests in
 * the repo (previously the 7/7 run was ad-hoc and uncommitted). Requires ext-sodium; the suite is
 * skipped with a clear message if it is not loaded (run locally with `php -d extension=sodium`).
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\SignatureVerifier;
use PHPUnit\Framework\TestCase;

final class SignatureVerifierTest extends TestCase {

	/** @var string base64 public key */
	private $publicKey;
	/** @var string raw secret key */
	private $secretKey;

	protected function setUp(): void {
		if ( ! extension_loaded( 'sodium' ) ) {
			$this->markTestSkipped( 'ext-sodium not loaded; run with: php -d extension=sodium vendor/bin/phpunit' );
		}
		$keypair         = sodium_crypto_sign_keypair();
		$this->publicKey = base64_encode( sodium_crypto_sign_publickey( $keypair ) );
		$this->secretKey = sodium_crypto_sign_secretkey( $keypair );
	}

	/** Sign a canonical request with the test secret key, returning the base64 signature. */
	private function sign( SignatureVerifier $v, string $method, string $path, int $ts, string $nonce, string $body ): string {
		$canonical = $v->canonicalString( $method, $path, $ts, $nonce, $body );
		return base64_encode( sodium_crypto_sign_detached( $canonical, $this->secretKey ) );
	}

	public function test_1_valid_signature_passes(): void {
		$v   = new SignatureVerifier();
		$sig = $this->sign( $v, 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r   = $v->verify( $this->publicKey, 'POST', '/option/foo', 1000, 'n1', '{"v":1}', $sig, 1000 );
		$this->assertTrue( $r['valid'] );
		$this->assertSame( 'ok', $r['reason'] );
	}

	public function test_2_tampered_body_is_mismatch(): void {
		$v   = new SignatureVerifier();
		$sig = $this->sign( $v, 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r   = $v->verify( $this->publicKey, 'POST', '/option/foo', 1000, 'n1', '{"v":2}', $sig, 1000 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'signature_mismatch', $r['reason'] );
	}

	public function test_3_tampered_method_is_mismatch(): void {
		$v   = new SignatureVerifier();
		$sig = $this->sign( $v, 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r   = $v->verify( $this->publicKey, 'DELETE', '/option/foo', 1000, 'n1', '{"v":1}', $sig, 1000 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'signature_mismatch', $r['reason'] );
	}

	public function test_4_expired_timestamp_rejected_before_crypto(): void {
		$v   = new SignatureVerifier( 300 );
		$sig = $this->sign( $v, 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		// now is 1000 + 301 -> just outside the 300s window.
		$r = $v->verify( $this->publicKey, 'POST', '/option/foo', 1000, 'n1', '{"v":1}', $sig, 1301 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'timestamp_out_of_window', $r['reason'] );
	}

	public function test_5_empty_signature_rejected(): void {
		$v = new SignatureVerifier();
		$r = $v->verify( $this->publicKey, 'POST', '/option/foo', 1000, 'n1', '{"v":1}', '', 1000 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'empty_signature', $r['reason'] );
	}

	public function test_6_malformed_key_rejected(): void {
		$v   = new SignatureVerifier();
		$sig = $this->sign( $v, 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r   = $v->verify( base64_encode( 'too-short' ), 'POST', '/option/foo', 1000, 'n1', '{"v":1}', $sig, 1000 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'malformed_key', $r['reason'] );
	}

	public function test_7_malformed_signature_rejected(): void {
		$v = new SignatureVerifier();
		$r = $v->verify( $this->publicKey, 'POST', '/option/foo', 1000, 'n1', '{"v":1}', base64_encode( 'short' ), 1000 );
		$this->assertFalse( $r['valid'] );
		$this->assertSame( 'malformed_signature', $r['reason'] );
	}
}
