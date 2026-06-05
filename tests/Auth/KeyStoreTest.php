<?php
/**
 * Unit tests for ArrayKeyStore (the KeyStore contract) — resolve known/unknown, seeding, add.
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\ArrayKeyStore;
use AwareWave\WpBridge\Auth\KeyRecord;
use PHPUnit\Framework\TestCase;

final class KeyStoreTest extends TestCase {

	public function test_resolve_known_key_returns_record(): void {
		$record = new KeyRecord( 'soulful-write', 'pub', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_ACTIVE );
		$store  = new ArrayKeyStore( array( $record ) );
		$this->assertSame( $record, $store->resolve( 'soulful-write' ) );
	}

	public function test_resolve_unknown_key_returns_null(): void {
		$store = new ArrayKeyStore();
		$this->assertNull( $store->resolve( 'nope' ) );
	}

	public function test_add_then_resolve(): void {
		$store  = new ArrayKeyStore();
		$record = new KeyRecord( 'k2', 'pub', KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE );
		$store->add( $record );
		$this->assertSame( $record, $store->resolve( 'k2' ) );
	}

	public function test_rotation_overlap_both_resolvable(): void {
		$old = new KeyRecord( 'k-old', 'pubA', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_RETIRING );
		$new = new KeyRecord( 'k-new', 'pubB', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_ACTIVE );
		$store = new ArrayKeyStore( array( $old, $new ) );
		$this->assertTrue( $store->resolve( 'k-old' )->isUsable(), 'retiring key still resolves during grace' );
		$this->assertTrue( $store->resolve( 'k-new' )->isUsable() );
	}
}
