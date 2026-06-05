<?php
/**
 * Unit tests for KeyRecord — the scope / status / IP predicates the Router relies on.
 * The security-relevant property: unknown scope/status degrade to the SAFE (least-privilege) option.
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\KeyRecord;
use PHPUnit\Framework\TestCase;

final class KeyRecordTest extends TestCase {

	public function test_write_key_allows_read_and_write(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_ACTIVE );
		$this->assertTrue( $k->allowsRead() );
		$this->assertTrue( $k->allowsWrite() );
	}

	public function test_read_key_allows_read_not_write(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE );
		$this->assertTrue( $k->allowsRead() );
		$this->assertFalse( $k->allowsWrite() );
	}

	public function test_unknown_scope_degrades_to_read(): void {
		$k = new KeyRecord( 'k1', 'pub', 'superuser', KeyRecord::STATUS_ACTIVE );
		$this->assertSame( KeyRecord::SCOPE_READ, $k->scope() );
		$this->assertFalse( $k->allowsWrite(), 'an unrecognised scope must NOT grant write' );
	}

	public function test_revoked_key_is_unusable_for_everything(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_REVOKED );
		$this->assertFalse( $k->isUsable() );
		$this->assertFalse( $k->allowsRead() );
		$this->assertFalse( $k->allowsWrite() );
	}

	public function test_retiring_key_still_usable_for_rotation_grace(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_WRITE, KeyRecord::STATUS_RETIRING );
		$this->assertTrue( $k->isUsable() );
		$this->assertTrue( $k->allowsRead() );
		$this->assertTrue( $k->allowsWrite() );
	}

	public function test_unknown_status_degrades_to_revoked(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_WRITE, 'paused' );
		$this->assertSame( KeyRecord::STATUS_REVOKED, $k->status() );
		$this->assertFalse( $k->isUsable(), 'an unrecognised status must NOT be usable' );
	}

	public function test_empty_ip_allowlist_permits_any_ip(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE, array() );
		$this->assertTrue( $k->ipAllowed( '203.0.113.7' ) );
	}

	public function test_non_empty_ip_allowlist_restricts(): void {
		$k = new KeyRecord( 'k1', 'pub', KeyRecord::SCOPE_READ, KeyRecord::STATUS_ACTIVE, array( '198.51.100.1' ) );
		$this->assertTrue( $k->ipAllowed( '198.51.100.1' ) );
		$this->assertFalse( $k->ipAllowed( '203.0.113.7' ) );
	}
}
