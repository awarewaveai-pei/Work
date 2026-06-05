<?php
/**
 * WpdbNonceStore — production NonceStore backed by a dedicated WordPress DB table.
 *
 * Why a custom table and not a WP transient:
 *   - Transients are NOT atomic. get_transient()-then-set_transient() can interleave between two
 *     concurrent identical nonces and let both pass — a replay hole. NonceStore's whole invariant
 *     is atomic single-use, so we need a primitive the database enforces.
 *   - The atomic primitive used here is a UNIQUE PRIMARY KEY on the nonce + `INSERT IGNORE`:
 *       * row inserted  -> 1 affected row  -> this caller is the first (fresh)
 *       * duplicate key -> 0 affected rows -> already spent (replayed)
 *     Two concurrent inserts of the same nonce: the database serialises them on the key, so exactly
 *     one gets "1" and the other "0". No application-level locking required.
 *
 * Why VARBINARY (not VARCHAR) for the nonce column:
 *   - A case-insensitive collation would fold 'AbC' and 'abc' to the same key. That is BOTH a
 *     correctness bug (a distinct valid nonce wrongly rejected as a replay) and a subtle security
 *     smell. VARBINARY compares byte-for-byte, so the key space matches the nonce exactly.
 *
 * Fail-closed: a query that fails to execute (connection lost, table missing) makes $wpdb->query()
 * return false; we translate that to NonceStoreUnavailable so NonceCache rejects the request rather
 * than assume freshness. See DESIGN §E top-risk #3.
 *
 * NOTE: table creation (via dbDelta on plugin activation) and the scheduled prune (wp-cron) belong
 * to the activation/lifecycle brick, not here. tableSchema() exposes the canonical DDL so that brick
 * and the db-expert review share one source of truth.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class WpdbNonceStore implements NonceStore {

	/** @var \wpdb The WordPress database access object. */
	private $wpdb;

	/** @var string Fully-prefixed table name, e.g. wp_awbridge_nonces. */
	private $table;

	/**
	 * @param \wpdb $wpdb The global $wpdb (injected, not reached for, so this stays testable).
	 */
	public function __construct( $wpdb ) {
		$this->wpdb  = $wpdb;
		// $wpdb->prefix is operator-controlled, not user input; identifiers cannot be prepared().
		$this->table = $wpdb->prefix . 'awbridge_nonces';
	}

	/**
	 * @inheritDoc
	 */
	public function remember( string $nonce, int $expiresAt ): bool {
		$sql = $this->wpdb->prepare(
			"INSERT IGNORE INTO `{$this->table}` ( nonce, expires_at ) VALUES ( %s, %d )",
			$nonce,
			$expiresAt
		);

		$result = $this->wpdb->query( $sql );

		if ( $result === false ) {
			// Query did not execute -> we cannot prove freshness -> fail closed.
			throw new NonceStoreUnavailable( 'nonce store INSERT failed: ' . (string) $this->wpdb->last_error );
		}

		// INSERT IGNORE: 1 = newly inserted (fresh), 0 = duplicate key (replayed).
		// The nonce length is bounded by NonceCache and the column is sized to match, so IGNORE
		// cannot here be masking a truncation; 0 means duplicate, not a swallowed error.
		return (int) $result === 1;
	}

	/**
	 * Delete expired nonce rows. Storage hygiene only; correctness is unaffected because an expired
	 * nonce re-presented is independently rejected by the upstream timestamp window.
	 *
	 * @return int|false rows deleted, or false if the delete failed to execute.
	 */
	public function pruneExpired( int $now ) {
		$sql = $this->wpdb->prepare(
			"DELETE FROM `{$this->table}` WHERE expires_at <= %d",
			$now
		);
		return $this->wpdb->query( $sql );
	}

	/**
	 * Canonical DDL for the activation brick + db-expert review. dbDelta-compatible.
	 *
	 * @param string $prefix  $wpdb->prefix
	 * @param string $collate $wpdb->get_charset_collate() (binary column ignores collation, but the
	 *                        table-level clause keeps it consistent with the rest of the schema).
	 */
	public static function tableSchema( string $prefix, string $collate ): string {
		$table = $prefix . 'awbridge_nonces';
		return "CREATE TABLE `{$table}` (\n"
			. "  nonce VARBINARY(256) NOT NULL,\n"
			. "  expires_at INT UNSIGNED NOT NULL,\n"
			. "  PRIMARY KEY  (nonce),\n"
			. "  KEY expires_at (expires_at)\n"
			. ") {$collate};";
	}
}
