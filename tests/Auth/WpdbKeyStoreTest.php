<?php
/**
 * Unit tests for WpdbKeyStore using a fake $wpdb — found/not-found/outage/prepare-fail/over-long id.
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\KeyRecord;
use AwareWave\WpBridge\Auth\KeyStoreUnavailable;
use AwareWave\WpBridge\Auth\WpdbKeyStore;
use PHPUnit\Framework\TestCase;

/** Minimal $wpdb stand-in for the key store (distinct name from the nonce-store fake). */
final class FakeKeyWpdb {
	public $prefix = 'wp_';
	public $last_error = '';
	public $prepareReturns = 'PREPARED_SQL';
	public $rowReturns = null;
	public $resultsReturns = array();
	public $lastQuery = null;

	public function prepare( $query, ...$args ) {
		return $this->prepareReturns;
	}

	public function get_row( $sql, $output = null ) {
		$this->lastQuery = $sql;
		return $this->rowReturns;
	}

	public function get_results( $sql, $output = null ) {
		return $this->resultsReturns;
	}
}

final class WpdbKeyStoreTest extends TestCase {

	public function test_resolve_found_builds_keyrecord(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = array(
			'key_id'       => 'soulful-write',
			'public_key'   => 'pubkey-b64',
			'scope'        => 'write',
			'status'       => 'active',
			'ip_allowlist' => '["198.51.100.1"]',
		);
		$record = ( new WpdbKeyStore( $db ) )->resolve( 'soulful-write' );
		$this->assertInstanceOf( KeyRecord::class, $record );
		$this->assertSame( 'soulful-write', $record->keyId() );
		$this->assertTrue( $record->allowsWrite() );
		$this->assertTrue( $record->ipAllowed( '198.51.100.1' ) );
		$this->assertFalse( $record->ipAllowed( '203.0.113.7' ) );
	}

	public function test_resolve_not_found_returns_null(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = null;
		$db->last_error = '';
		$this->assertNull( ( new WpdbKeyStore( $db ) )->resolve( 'ghost' ) );
	}

	public function test_resolve_db_error_fails_closed(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = null;
		$db->last_error = 'connection lost';
		$this->expectException( KeyStoreUnavailable::class );
		( new WpdbKeyStore( $db ) )->resolve( 'soulful-write' );
	}

	public function test_prepare_failure_fails_closed(): void {
		$db                 = new FakeKeyWpdb();
		$db->prepareReturns = '';
		$this->expectException( KeyStoreUnavailable::class );
		( new WpdbKeyStore( $db ) )->resolve( 'soulful-write' );
	}

	public function test_overlong_key_id_returns_null_without_query(): void {
		$db    = new FakeKeyWpdb();
		$store = new WpdbKeyStore( $db );
		$this->assertNull( $store->resolve( str_repeat( 'x', WpdbKeyStore::KEY_ID_BYTES + 1 ) ) );
		$this->assertNull( $db->lastQuery, 'an over-long key_id must not hit the database' );
	}

	public function test_corrupt_ip_allowlist_fails_closed_deny_all(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = array(
			'key_id'       => 'k',
			'public_key'   => 'pub',
			'scope'        => 'read',
			'status'       => 'active',
			'ip_allowlist' => 'not-json',
		);
		$record = ( new WpdbKeyStore( $db ) )->resolve( 'k' );
		// Corrupt non-empty value must DENY (fail closed), never widen to "any IP".
		$this->assertFalse( $record->ipAllowed( '203.0.113.7' ) );
	}

	public function test_null_ip_allowlist_means_any_ip(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = array(
			'key_id'       => 'k',
			'public_key'   => 'pub',
			'scope'        => 'read',
			'status'       => 'active',
			'ip_allowlist' => null,
		);
		$record = ( new WpdbKeyStore( $db ) )->resolve( 'k' );
		$this->assertTrue( $record->ipAllowed( '203.0.113.7' ) );
	}

	public function test_non_array_row_fails_closed(): void {
		$db             = new FakeKeyWpdb();
		$db->rowReturns = 'a scalar, not an array';
		$db->last_error = '';
		$this->expectException( KeyStoreUnavailable::class );
		( new WpdbKeyStore( $db ) )->resolve( 'k' );
	}

	public function test_has_expected_columns_true_when_all_present(): void {
		$db = new FakeKeyWpdb();
		$db->resultsReturns = array(
			array( 'Field' => 'key_id' ), array( 'Field' => 'public_key' ), array( 'Field' => 'scope' ),
			array( 'Field' => 'status' ), array( 'Field' => 'ip_allowlist' ), array( 'Field' => 'created_at' ),
		);
		$this->assertTrue( ( new WpdbKeyStore( $db ) )->hasExpectedColumns() );
	}

	public function test_has_expected_columns_false_when_missing(): void {
		$db = new FakeKeyWpdb();
		$db->resultsReturns = array( array( 'Field' => 'key_id' ), array( 'Field' => 'public_key' ) );
		$this->assertFalse( ( new WpdbKeyStore( $db ) )->hasExpectedColumns() );
	}
}
