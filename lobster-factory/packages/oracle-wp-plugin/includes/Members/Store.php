<?php
/**
 * The two member tables (ORACLE-WP-SPEC §2-5) and every query on them.
 *  - {prefix}aworacle_charts   a member's own charts
 *  - {prefix}aworacle_persons  people a member saved for private compatibility readings (D4): linked to no
 *                              account, nobody is notified
 * Columns in the clear: id, user_id, timestamps. Everything the member typed (name, birth data) is one
 * Vault blob bound to "<kind>:<user id>".
 *
 * Ownership invariant: every read, update and delete has "AND user_id = <the member>" in the same SQL
 * statement — no fetch-then-check, so there is no path that touches another member's row.
 *
 * Deletion invariant: rows never outlive their member. Events (Privacy: delete_user, remove_user_from_blog)
 * cover deletions while the plugin runs; purgeOrphans() reconciles the rest (member deleted while the plugin
 * was inactive, or from a network screen that does not load it) on install/activation and once a day.
 *
 * Schema: install() runs dbDelta and records SCHEMA_VERSION; maybeInstall() runs it on any request where
 * the stored version differs (plugin updated in place, network-activated sites, activation hook skipped),
 * at most every RETRY_SECONDS when it keeps failing.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Crypto\Vault;

final class Store {

	const SCHEMA_VERSION = '2'; // 2 = P3 daily-letter tables (Daily\Store)
	const SCHEMA_OPTION  = 'aworacle_db_version';
	const RETRY_FLAG     = 'aworacle_db_install_retry';
	const RETRY_SECONDS  = 300;
	const PURGE_HOOK     = 'aworacle_purge_orphans';

	/** create() results other than a new id. */
	const AT_LIMIT     = -1;
	const WRITE_FAILED = 0;

	/** kind => [table suffix, rows a member may keep] */
	const KINDS = array(
		'charts'  => array( 'aworacle_charts', 50 ),
		'persons' => array( 'aworacle_persons', 200 ),
	);

	public static function isKind( string $kind ): bool {
		return isset( self::KINDS[ $kind ] );
	}

	public static function table( string $kind ): string {
		global $wpdb;
		return $wpdb->prefix . self::KINDS[ $kind ][0];
	}

	public static function limit( string $kind ): int {
		return self::KINDS[ $kind ][1];
	}

	public static function context( string $kind, int $userId ): string {
		return $kind . ':' . $userId;
	}

	public static function tableExists( string $kind ): bool {
		global $wpdb;
		$table = self::table( $kind );
		return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) ) === $table;
	}

	public static function maybeInstall(): void {
		// Independent of the schema version: a site whose tables already exist still gets the daily purge.
		if ( ! wp_next_scheduled( self::PURGE_HOOK ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::PURGE_HOOK );
		}
		if ( get_option( self::SCHEMA_OPTION ) === self::SCHEMA_VERSION || get_transient( self::RETRY_FLAG ) ) {
			return;
		}
		self::install();
	}

	public static function install(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $wpdb->get_charset_collate();
		foreach ( array_keys( self::KINDS ) as $kind ) {
			$table = self::table( $kind );
			// dbDelta format: two spaces after PRIMARY KEY, one column per line.
			dbDelta(
				"CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  user_id bigint(20) unsigned NOT NULL,
  data text NOT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY user_id (user_id)
) {$charset};"
			);
		}
		$daily = \AwareWave\Oracle\Daily\Store::install( $charset );
		self::purgeOrphans();
		// Record the version only when every table is really there; otherwise retry after a pause.
		foreach ( array_keys( self::KINDS ) as $kind ) {
			if ( ! $daily || ! self::tableExists( $kind ) ) {
				set_transient( self::RETRY_FLAG, 1, self::RETRY_SECONDS );
				return;
			}
		}
		update_option( self::SCHEMA_OPTION, self::SCHEMA_VERSION, true );
	}

	/** Deactivation and uninstall. */
	public static function unschedule(): void {
		wp_clear_scheduled_hook( self::PURGE_HOOK );
		\AwareWave\Oracle\Daily\Hooks::unschedule();
	}

	/** Uninstall: the member tables (KINDS) and the daily-letter tables are dropped, with the schema markers. */
	public static function drop(): void {
		global $wpdb;
		\AwareWave\Oracle\Daily\Store::drop();
		foreach ( array_keys( self::KINDS ) as $kind ) {
			$wpdb->query( 'DROP TABLE IF EXISTS ' . self::table( $kind ) ); // phpcs:ignore WordPress.DB.PreparedSQL -- table names from KINDS
		}
		delete_option( self::SCHEMA_OPTION );
		delete_transient( self::RETRY_FLAG );
		self::unschedule();
	}

	/**
	 * Delete rows whose member no longer exists — or, on multisite, is no longer a member of this site
	 * (no "<this site's prefix>capabilities" user meta).
	 */
	public static function purgeOrphans(): int {
		global $wpdb;
		$removed = 0;
		foreach ( array_keys( self::KINDS ) as $kind ) {
			if ( ! self::tableExists( $kind ) ) {
				continue;
			}
			$table    = self::table( $kind );
			$removed += (int) $wpdb->query( "DELETE t FROM {$table} t LEFT JOIN {$wpdb->users} u ON u.ID = t.user_id WHERE u.ID IS NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL -- table names only
			if ( is_multisite() ) {
				$removed += (int) $wpdb->query(
					$wpdb->prepare(
						"DELETE t FROM {$table} t WHERE NOT EXISTS (SELECT 1 FROM {$wpdb->usermeta} m WHERE m.user_id = t.user_id AND m.meta_key = %s)", // phpcs:ignore WordPress.DB.PreparedSQL
						$wpdb->get_blog_prefix() . 'capabilities'
					)
				);
			}
		}
		return $removed;
	}

	/**
	 * The member's rows, newest first. A row the current key cannot open comes back with data null.
	 * $all: every row (privacy export); otherwise at most limit() (the member's list).
	 *
	 * @return array<int,array{id:int,data:array<string,mixed>|null,created_at:string,updated_at:string}>
	 */
	public static function listFor( string $kind, int $userId, string $key, bool $all = false ): array {
		global $wpdb;
		$sql  = 'SELECT id, data, created_at, updated_at FROM ' . self::table( $kind ) . ' WHERE user_id = %d ORDER BY id DESC'; // phpcs:ignore WordPress.DB.PreparedSQL
		$rows = $all
			? $wpdb->get_results( $wpdb->prepare( $sql, $userId ), ARRAY_A ) // phpcs:ignore WordPress.DB.PreparedSQL
			: $wpdb->get_results( $wpdb->prepare( $sql . ' LIMIT %d', $userId, self::limit( $kind ) ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out = array();
		foreach ( (array) $rows as $row ) {
			$out[] = self::shape( $kind, $userId, $row, $key );
		}
		return $out;
	}

	/** @return array{id:int,data:array<string,mixed>|null,created_at:string,updated_at:string}|null */
	public static function get( string $kind, int $userId, int $id, string $key ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT id, data, created_at, updated_at FROM ' . self::table( $kind ) . ' WHERE id = %d AND user_id = %d', // phpcs:ignore WordPress.DB.PreparedSQL
				$id,
				$userId
			),
			ARRAY_A
		);
		return is_array( $row ) ? self::shape( $kind, $userId, $row, $key ) : null;
	}

	/**
	 * Count and insert under one per-member lock, so parallel requests cannot pass the limit.
	 *
	 * @param array<string,mixed> $data a Record::clean() result
	 * @return int new id, AT_LIMIT, or WRITE_FAILED (no table, lock timeout, insert error)
	 */
	public static function create( string $kind, int $userId, array $data, string $key ): int {
		global $wpdb;
		$lock = 'aworacle:' . $wpdb->prefix . $kind . ':' . $userId;
		if ( (int) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $lock ) ) !== 1 ) {
			return self::WRITE_FAILED;
		}
		try {
			$count = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::table( $kind ) . ' WHERE user_id = %d', $userId ) ); // phpcs:ignore WordPress.DB.PreparedSQL
			if ( $count >= self::limit( $kind ) ) {
				return self::AT_LIMIT;
			}
			$now = current_time( 'mysql', true );
			$ok  = $wpdb->insert(
				self::table( $kind ),
				array(
					'user_id'    => $userId,
					'data'       => Vault::seal( $data, $key, self::context( $kind, $userId ) ),
					'created_at' => $now,
					'updated_at' => $now,
				),
				array( '%d', '%s', '%s', '%s' )
			);
			return $ok ? (int) $wpdb->insert_id : self::WRITE_FAILED;
		} finally {
			$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
		}
	}

	/** @param array<string,mixed> $data a Record::clean() result. False = no such row of this member. */
	public static function update( string $kind, int $userId, int $id, array $data, string $key ): bool {
		global $wpdb;
		$changed = $wpdb->query(
			$wpdb->prepare(
				'UPDATE ' . self::table( $kind ) . ' SET data = %s, updated_at = %s WHERE id = %d AND user_id = %d', // phpcs:ignore WordPress.DB.PreparedSQL
				Vault::seal( $data, $key, self::context( $kind, $userId ) ),
				current_time( 'mysql', true ),
				$id,
				$userId
			)
		);
		return is_int( $changed ) && $changed > 0;
	}

	/** False = no such row of this member. */
	public static function delete( string $kind, int $userId, int $id ): bool {
		global $wpdb;
		$deleted = $wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table( $kind ) . ' WHERE id = %d AND user_id = %d', $id, $userId ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		return is_int( $deleted ) && $deleted > 0;
	}

	/** Every row of the member in every existing table (privacy erasure, user deletion). Needs no key. */
	public static function deleteAllFor( int $userId ): int {
		global $wpdb;
		if ( $userId <= 0 ) {
			return 0;
		}
		$removed = 0;
		foreach ( array_keys( self::KINDS ) as $kind ) {
			if ( self::tableExists( $kind ) ) {
				$removed += (int) $wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table( $kind ) . ' WHERE user_id = %d', $userId ) ); // phpcs:ignore WordPress.DB.PreparedSQL
			}
		}
		return $removed;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array{id:int,data:array<string,mixed>|null,created_at:string,updated_at:string}
	 */
	private static function shape( string $kind, int $userId, array $row, string $key ): array {
		return array(
			'id'         => (int) $row['id'],
			'data'       => $key === '' ? null : Vault::open( (string) $row['data'], $key, self::context( $kind, $userId ) ),
			'created_at' => (string) $row['created_at'],
			'updated_at' => (string) $row['updated_at'],
		);
	}
}
