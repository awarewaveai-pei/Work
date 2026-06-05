<?php
/**
 * Integration tests for RequestAuthenticator — the full KeyStore + SignatureVerifier + NonceCache
 * pipeline, exercised with real Ed25519 signatures (ext-sodium) and in-memory stores.
 *
 * Beyond the happy/deny paths, the key behaviour proven here is the AUTHENTICATE-THEN-AUTHORIZE
 * ordering: a revoked key presented WITHOUT a valid signature returns the generic unauthenticated
 * response, NOT 'key_revoked' — so authorization facts never leak to a caller who hasn't proven key
 * ownership.
 */

namespace AwareWave\WpBridge\Tests\Http;

use AwareWave\WpBridge\Auth\ArrayKeyStore;
use AwareWave\WpBridge\Auth\ArrayNonceStore;
use AwareWave\WpBridge\Auth\KeyRecord;
use AwareWave\WpBridge\Auth\KeyStore;
use AwareWave\WpBridge\Auth\KeyStoreUnavailable;
use AwareWave\WpBridge\Auth\NonceCache;
use AwareWave\WpBridge\Auth\NonceStore;
use AwareWave\WpBridge\Auth\NonceStoreUnavailable;
use AwareWave\WpBridge\Auth\SignatureVerifier;
use AwareWave\WpBridge\Http\RequestAuthenticator;
use AwareWave\WpBridge\Http\SignedRequest;
use PHPUnit\Framework\TestCase;

/** A key store that always errors — proves the pipeline fails closed (503) on a store outage. */
final class ThrowingKeyStore implements KeyStore {
	public function resolve( string $keyId ): ?KeyRecord {
		throw new KeyStoreUnavailable( 'down' );
	}
}

/** A nonce store that always errors — proves nonce-store outage fails closed (503). */
final class ThrowingNonceStore implements NonceStore {
	public function remember( string $nonce, int $expiresAt ): bool {
		throw new NonceStoreUnavailable( 'down' );
	}
}

final class RequestAuthenticatorTest extends TestCase {

	/** @var string base64 public key */
	private $publicKey;
	/** @var string raw secret key */
	private $secretKey;

	protected function setUp(): void {
		if ( ! extension_loaded( 'sodium' ) ) {
			$this->markTestSkipped( 'ext-sodium not loaded; run with: php -d extension=sodium vendor/bin/phpunit' );
		}
		$kp              = sodium_crypto_sign_keypair();
		$this->publicKey = base64_encode( sodium_crypto_sign_publickey( $kp ) );
		$this->secretKey = sodium_crypto_sign_secretkey( $kp );
	}

	/** Build a correctly-signed SignedRequest for the given parameters. */
	private function signedRequest( string $keyId, string $method, string $path, int $ts, string $nonce, string $body, string $ip = '198.51.100.1' ): SignedRequest {
		$v         = new SignatureVerifier();
		$canonical = $v->canonicalString( $method, $path, $ts, $nonce, $body );
		$sig       = base64_encode( sodium_crypto_sign_detached( $canonical, $this->secretKey ) );
		return new SignedRequest( $keyId, $method, $path, $ts, $nonce, $body, $sig, $ip );
	}

	private function authenticator( KeyRecord $record, ?NonceCache $nonces = null ): RequestAuthenticator {
		$keys   = new ArrayKeyStore( array( $record ) );
		$nonces = $nonces ?: new NonceCache( new ArrayNonceStore() );
		return new RequestAuthenticator( $keys, new SignatureVerifier(), $nonces );
	}

	private function writeKey(): KeyRecord {
		return new KeyRecord( 'k-write', $this->publicKey, KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_ACTIVE );
	}

	public function test_valid_write_request_authenticates(): void {
		$auth = $this->authenticator( $this->writeKey() );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertTrue( $r->authenticated() );
		$this->assertSame( 200, $r->httpStatus() );
		$this->assertSame( 'k-write', $r->keyId() );
		$this->assertSame( KeyRecord::SCOPE_WRITE, $r->scope() );
	}

	public function test_read_key_on_read_endpoint_ok(): void {
		$readKey = new KeyRecord( 'k-read', $this->publicKey, KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE );
		$auth    = $this->authenticator( $readKey );
		$req     = $this->signedRequest( 'k-read', 'GET', '/option/foo', 1000, 'n1', '' );
		$r       = $auth->authenticate( $req, KeyRecord::SCOPE_READ, 1000 );
		$this->assertTrue( $r->authenticated() );
	}

	public function test_read_key_on_write_endpoint_is_insufficient_scope(): void {
		$readKey = new KeyRecord( 'k-read', $this->publicKey, KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE );
		$auth    = $this->authenticator( $readKey );
		$req     = $this->signedRequest( 'k-read', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r       = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertFalse( $r->authenticated() );
		$this->assertSame( 403, $r->httpStatus() );
		$this->assertSame( 'insufficient_scope', $r->reason() );
	}

	public function test_unknown_key_is_generic_unauthenticated(): void {
		$auth = $this->authenticator( $this->writeKey() );
		$req  = $this->signedRequest( 'k-does-not-exist', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 401, $r->httpStatus() );
		$this->assertSame( 'unknown_or_bad_signature', $r->reason() );
	}

	public function test_tampered_body_is_generic_unauthenticated(): void {
		$auth = $this->authenticator( $this->writeKey() );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$tampered = new SignedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":999}', $req->signatureBase64(), '198.51.100.1' );
		$r = $auth->authenticate( $tampered, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 401, $r->httpStatus() );
		$this->assertSame( 'unknown_or_bad_signature', $r->reason() );
	}

	public function test_expired_timestamp_collapses_on_wire_but_audits_precisely(): void {
		$auth = $this->authenticator( $this->writeKey() );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1500 ); // now=1500, window 300 -> stale
		$this->assertSame( 401, $r->httpStatus() );
		// Wire reason is the generic one (no timestamp oracle); the precise reason lives in the audit log.
		$this->assertSame( 'unknown_or_bad_signature', $r->reason() );
		$this->assertSame( 'timestamp_out_of_window', $r->auditReason() );
	}

	public function test_internal_error_fails_closed_503(): void {
		// A collaborator that throws an UNEXPECTED (non-typed) error must yield 503, not an uncaught 500.
		$boom = new class implements \AwareWave\WpBridge\Auth\KeyStore {
			public function resolve( string $keyId ): ?\AwareWave\WpBridge\Auth\KeyRecord {
				throw new \LogicException( 'unexpected' );
			}
		};
		$auth = new RequestAuthenticator( $boom, new SignatureVerifier(), new NonceCache( new ArrayNonceStore() ) );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 503, $r->httpStatus() );
		$this->assertSame( 'auth_unavailable', $r->reason() );
	}

	public function test_revoked_key_with_valid_signature_is_403(): void {
		$revoked = new KeyRecord( 'k-write', $this->publicKey, KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_REVOKED );
		$auth    = $this->authenticator( $revoked );
		$req     = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r       = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 403, $r->httpStatus() );
		$this->assertSame( 'key_revoked', $r->reason() );
	}

	public function test_revoked_key_WITHOUT_valid_signature_does_not_leak_revocation(): void {
		// Authenticate-then-authorize: a revoked key + bad signature must look like generic auth
		// failure (401), NOT 'key_revoked' (403) — otherwise it's a key-existence oracle.
		$revoked = new KeyRecord( 'k-write', $this->publicKey, KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_REVOKED );
		$auth    = $this->authenticator( $revoked );
		$bad     = new SignedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}', base64_encode( str_repeat( 'x', 64 ) ), '198.51.100.1' );
		$r       = $auth->authenticate( $bad, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 401, $r->httpStatus() );
		$this->assertSame( 'unknown_or_bad_signature', $r->reason() );
	}

	public function test_ip_not_allowed_with_valid_signature(): void {
		$restricted = new KeyRecord( 'k-write', $this->publicKey, KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_ACTIVE, array( '203.0.113.9' ) );
		$auth       = $this->authenticator( $restricted );
		$req        = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}', '198.51.100.1' );
		$r          = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 403, $r->httpStatus() );
		$this->assertSame( 'ip_not_allowed', $r->reason() );
	}

	public function test_replayed_nonce_is_rejected(): void {
		$auth = $this->authenticator( $this->writeKey() );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$this->assertTrue( $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 )->authenticated() );
		$replay = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 401, $replay->httpStatus() );
		$this->assertSame( 'replayed', $replay->reason() );
	}

	public function test_key_store_outage_fails_closed_503(): void {
		$auth = new RequestAuthenticator( new ThrowingKeyStore(), new SignatureVerifier(), new NonceCache( new ArrayNonceStore() ) );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 503, $r->httpStatus() );
		$this->assertSame( 'key_store_unavailable', $r->reason() );
	}

	public function test_nonce_store_outage_fails_closed_503(): void {
		$auth = $this->authenticator( $this->writeKey(), new NonceCache( new ThrowingNonceStore() ) );
		$req  = $this->signedRequest( 'k-write', 'POST', '/option/foo', 1000, 'n1', '{"v":1}' );
		$r    = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, 1000 );
		$this->assertSame( 503, $r->httpStatus() );
		$this->assertSame( 'nonce_store_unavailable', $r->reason() );
	}
}
