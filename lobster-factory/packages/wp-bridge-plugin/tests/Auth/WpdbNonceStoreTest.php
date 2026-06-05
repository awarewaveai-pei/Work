<?php
/**
 * Unit tests for WpdbNonceStore using a fake $wpdb (no real database).
 *
 * Proves the hardening that the DB review asked for: the store enforces its own column byte-bound,
 * fails closed on prepare()/query() failure, distinguishes a clean duplicate from an INSERT IGNORE
 * that swallowed an error, and can detect a table missing its PRIMARY KEY (the fail-open trap).
 */

namespace AwareWave\WpBridge\Tests\Auth;

use AwareWave\WpBridge\Auth\NonceStoreUnavailable;
use AwareWave\WpBridge\Auth\WpdbNonceStore;
use PHPUnit\Framework\TestCase;

/**
 * Minimal $wpdb stand-in. Each behaviour is a public knob so a test can drive one path.
 */
final class FakeWpdb {
	public $prefix = 'wp_';
	public $last_error = '';

	/** @var string|null what prepare() returns; null simulates a prepare() failure. */
	public $prepareReturns = 'PREPARED_SQL';
	/** @var int|false what query() returns. */
	public $queryReturns = 1;
	/** @var array what get_results() returns. */
	public $getResultsReturns = array();

	public $lastQuery = null;

	public function prepare( $query, ...$args ) {
		return $this->prepareReturns;
	}

	public function query( $sql ) {
		$this->lastQuery = $sql;
		return $this->queryReturns;
	}

	public function get_results( $sql ) {
		return $this->getResultsReturns;
	}
}

final class WpdbNonceStoreTest extends TestCase {

	public function test_fresh_insert_returns_true(): void {
		$db          = new FakeWpdb();
		$db->queryReturns = 1;
		$store       = new WpdbNonceStore( $db );
		$this->assertTrue( $store->remember( 'n1', 1000 ) );
	}

	public function test_duplicate_returns_false(): void {
		$db          = new FakeWpdb();
		$db->queryReturns = 0;
		$db->last_error   = '';
		$store       = new WpdbNonceStore( $db );
		$this->assertFalse( $store->remember( 'n1', 1000 ) );
	}

	public function test_overlong_nonce_fails_closed_without_touching_db(): void {
		$db    = new FakeWpdb();
		$store = new WpdbNonceStore( $db );
		$this->expectException( NonceStoreUnavailable::class );
		try {
			$store->remember( str_repeat( 'x', WpdbNonceStore::NONCE_COLUMN_BYTES + 1 ), 1000 );
		} finally {
			$this->assertNull( $db->lastQuery, 'an over-long nonce must never reach the database' );
		}
	}

	public function test_prepare_failure_fails_closed(): void {
		$db                 = new FakeWpdb();
		$db->prepareReturns = '';
		$store              = new WpdbNonceStore( $db );
		$this->expectException( NonceStoreUnavailable::class );
		$store->remember( 'n1', 1000 );
	}

	public function test_query_false_fails_closed(): void {
		$db               = new FakeWpdb();
		$db->queryReturns = false;
		$db->last_error   = 'connection lost';
		$store            = new WpdbNonceStore( $db );
		$this->expectException( NonceStoreUnavailable::class );
		$store->remember( 'n1', 1000 );
	}

	public function test_zero_rows_with_error_is_ambiguous_and_fails_closed(): void {
		$db               = new FakeWpdb();
		$db->queryReturns = 0;
		$db->last_error   = 'Data too long for column';
		$store            = new WpdbNonceStore( $db );
		$this->expectException( NonceStoreUnavailable::class );
		$store->remember( 'n1', 1000 );
	}

	public function test_has_primary_key_true_when_index_present(): void {
		$db                    = new FakeWpdb();
		$db->getResultsReturns = array( (object) array( 'Key_name' => 'PRIMARY', 'Column_name' => 'nonce' ) );
		$store                 = new WpdbNonceStore( $db );
		$this->assertTrue( $store->hasPrimaryKeyOnNonce() );
	}

	public function test_has_primary_key_false_when_index_missing(): void {
		$db                    = new FakeWpdb();
		$db->getResultsReturns = array();
		$store                 = new WpdbNonceStore( $db );
		$this->assertFalse( $store->hasPrimaryKeyOnNonce(), 'missing PK must be detectable (fail-open trap)' );
	}
}
