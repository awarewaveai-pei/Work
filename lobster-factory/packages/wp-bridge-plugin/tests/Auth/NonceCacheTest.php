<?php
/**
 * Unit tests for NonceCache — the replay-protection coordinator.
 *
 * These prove the security-relevant behaviours: replay is blocked, structurally bad nonces are
 * rejected before storage, a store outage FAILS CLOSED, and the GC expiry is derived from the
 * request timestamp + window. Atomic single-use itself is a NonceStore-implementation property
 * (see WpdbNonceStore) and is exercised at the contract level here via the in-memory store.
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\ArrayNonceStore;
use AwareWave\WpBridge\Auth\NonceCache;
use AwareWave\WpBridge\Auth\NonceStore;
use AwareWave\WpBridge\Auth\NonceStoreUnavailable;
use PHPUnit\Framework\TestCase;

/** A store that always blows up — used to prove fail-closed behaviour. */
final class ExplodingNonceStore implements NonceStore {
	public function remember( string $nonce, int $expiresAt ): bool {
		throw new NonceStoreUnavailable( 'simulated outage' );
	}
}

/** A store that records the exact (nonce, expiresAt) it was handed — used to assert expiry math. */
final class SpyNonceStore implements NonceStore {
	/** @var array<int,array{0:string,1:int}> */
	public $calls = array();
	public function remember( string $nonce, int $expiresAt ): bool {
		$this->calls[] = array( $nonce, $expiresAt );
		return true;
	}
}

final class NonceCacheTest extends TestCase {

	public function test_first_use_is_fresh(): void {
		$cache  = new NonceCache( new ArrayNonceStore() );
		$result = $cache->check( 'nonce-abc', 1_000_000 );
		$this->assertTrue( $result['fresh'] );
		$this->assertSame( 'ok', $result['reason'] );
	}

	public function test_reuse_is_replayed(): void {
		$cache = new NonceCache( new ArrayNonceStore() );
		$cache->check( 'nonce-abc', 1_000_000 );
		$second = $cache->check( 'nonce-abc', 1_000_050 );
		$this->assertFalse( $second['fresh'] );
		$this->assertSame( 'replayed', $second['reason'] );
	}

	public function test_distinct_nonces_are_both_fresh(): void {
		$cache = new NonceCache( new ArrayNonceStore() );
		$this->assertTrue( $cache->check( 'nonce-a', 1_000_000 )['fresh'] );
		$this->assertTrue( $cache->check( 'nonce-b', 1_000_000 )['fresh'] );
	}

	public function test_empty_nonce_rejected_before_storage(): void {
		$spy    = new SpyNonceStore();
		$result = ( new NonceCache( $spy ) )->check( '', 1_000_000 );
		$this->assertFalse( $result['fresh'] );
		$this->assertSame( 'empty_nonce', $result['reason'] );
		$this->assertCount( 0, $spy->calls, 'storage must not be touched for an empty nonce' );
	}

	public function test_overlong_nonce_rejected_before_storage(): void {
		$spy    = new SpyNonceStore();
		$long   = str_repeat( 'x', NonceCache::MAX_NONCE_LENGTH + 1 );
		$result = ( new NonceCache( $spy ) )->check( $long, 1_000_000 );
		$this->assertFalse( $result['fresh'] );
		$this->assertSame( 'nonce_too_long', $result['reason'] );
		$this->assertCount( 0, $spy->calls, 'storage must not be touched for an over-long nonce' );
	}

	public function test_max_length_nonce_is_accepted(): void {
		$exact  = str_repeat( 'x', NonceCache::MAX_NONCE_LENGTH );
		$result = ( new NonceCache( new ArrayNonceStore() ) )->check( $exact, 1_000_000 );
		$this->assertTrue( $result['fresh'], 'a nonce exactly at the limit must be allowed' );
	}

	public function test_store_outage_fails_closed(): void {
		$cache  = new NonceCache( new ExplodingNonceStore() );
		$result = $cache->check( 'nonce-abc', 1_000_000 );
		$this->assertFalse( $result['fresh'], 'a store outage must NOT be treated as fresh' );
		$this->assertSame( 'store_unavailable', $result['reason'] );
	}

	public function test_expiry_is_timestamp_plus_window(): void {
		$spy = new SpyNonceStore();
		( new NonceCache( $spy, 300 ) )->check( 'nonce-abc', 1_000_000 );
		$this->assertSame( array( 'nonce-abc', 1_000_300 ), $spy->calls[0] );
	}

	public function test_zero_window_falls_back_to_default(): void {
		$spy = new SpyNonceStore();
		( new NonceCache( $spy, 0 ) )->check( 'nonce-abc', 1_000_000 );
		// A window of 0 would expire nonce rows immediately; the guard must restore the safe default
		// (SignatureVerifier::DEFAULT_WINDOW_SECONDS = 300), so expiry must be timestamp + 300.
		$this->assertSame( 1_000_300, $spy->calls[0][1] );
	}

	public function test_negative_window_falls_back_to_default(): void {
		$spy = new SpyNonceStore();
		( new NonceCache( $spy, -5 ) )->check( 'nonce-abc', 1_000_000 );
		// A negative window takes the same > 0 guard branch; expiry must still be timestamp + 300.
		$this->assertSame( 1_000_300, $spy->calls[0][1] );
	}
}
