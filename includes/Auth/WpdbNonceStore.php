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

	/**
	 * Byte capacity of the `nonce` column. The store enforces this itself (remember()) and the DDL
	 * (tableSchema()) derives the VARBINARY size from it, so the app bound and the column bound can
	 * never drift apart. Must be >= NonceCache::MAX_NONCE_LENGTH.
	 */
	public const NONCE_COLUMN_BYTES = 256;

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
		// Enforce the column's byte bound in the store itself rather than trusting the caller. A nonce
		// longer than VARBINARY(256) would be SILENTLY TRUNCATED by INSERT IGNORE (which downgrades
		// truncation to a warning), and the stored prefix could collide with another nonce. Reject
		// here -> fail closed. strlen() is byte length, matching the column's byte capacity.
		if ( strlen( $nonce ) > self::NONCE_COLUMN_BYTES ) {
			throw new NonceStoreUnavailable( 'nonce exceeds storage column bound (' . self::NONCE_COLUMN_BYTES . ' bytes)' );
		}

		$sql = $this->wpdb->prepare(
			"INSERT IGNORE INTO `{$this->table}` ( nonce, expires_at ) VALUES ( %s, %d )",
			$nonce,
			$expiresAt
		);

		// prepare() returns '' / null on a malformed format string. Treat that as an outage and fail
		// closed BY DESIGN, rather than executing an empty query and inferring freshness from it.
		if ( ! is_string( $sql ) || $sql === '' ) {
			throw new NonceStoreUnavailable( 'nonce store prepare() failed' );
		}

		$result = $this->wpdb->query( $sql );

		if ( $result === false ) {
			// Query did not execute -> we cannot prove freshness -> fail closed.
			throw new NonceStoreUnavailable( 'nonce store INSERT failed: ' . (string) $this->wpdb->last_error );
		}

		// INSERT IGNORE: 1 = newly inserted (fresh).
		if ( (int) $result === 1 ) {
			return true;
		}

		// 0 affected rows. Normally a duplicate key (a genuine replay). But INSERT IGNORE also
		// downgrades real errors to warnings; if one surfaced as an error, last_error is non-empty,
		// so we cannot prove this was a CLEAN duplicate -> fail closed instead of reporting "replayed".
		if ( (string) $this->wpdb->last_error !== '' ) {
			throw new NonceStoreUnavailable( 'nonce store INSERT ambiguous: ' . (string) $this->wpdb->last_error );
		}

		return false; // clean duplicate -> replayed
	}

	/**
	 * Worst-failure-mode guard: if the table exists WITHOUT a PRIMARY KEY on `nonce` (e.g. dbDelta
	 * silently dropped it, or a legacy table predates this schema), INSERT IGNORE would never detect
	 * a duplicate and replay protection would be silently FAIL-OPEN. The activation brick and /health
	 * MUST call this and refuse to enable writes when it returns false. (DESIGN §E top-risk #3 + db
	 * review C1.)
	 *
	 * @return bool true iff the deployed table has a PRIMARY KEY on the `nonce` column.
	 */
	public function hasPrimaryKeyOnNonce(): bool {
		$rows = $this->wpdb->get_results(
			$this->wpdb->prepare(
				"SHOW INDEX FROM `{$this->table}` WHERE Key_name = %s AND Column_name = %s",
				'PRIMARY',
				'nonce'
			)
		);
		return is_array( $rows ) && count( $rows ) === 1;
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
		// expires_at is BIGINT UNSIGNED (not INT) so it never becomes the limiting factor — INT UNSIGNED
		// would overflow in 2106; this is a 30-year component. VARBINARY size is bound to the column
		// constant so the app-level length guard and the schema can't drift.
		return "CREATE TABLE `{$table}` (\n"
			. '  nonce VARBINARY(' . self::NONCE_COLUMN_BYTES . ") NOT NULL,\n"
			. "  expires_at BIGINT UNSIGNED NOT NULL,\n"
			. "  PRIMARY KEY  (nonce),\n"
			. "  KEY expires_at (expires_at)\n"
			. ") {$collate};";
	}
}
