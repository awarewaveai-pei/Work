<?php
/**
 * WpdbKeyStore — production KeyStore backed by a WordPress DB table.
 *
 * Resolves a key_id to its KeyRecord with a single prepared SELECT. The table holds ONLY public
 * keys + metadata (scope/status/ip allowlist); private keys never touch the site (SignatureVerifier).
 *
 * Fail-closed: a SELECT that fails to execute makes $wpdb->get_row() return null, which is
 * indistinguishable from "no such key" — so on a null result we cross-check $wpdb->last_error and,
 * if it is non-empty, raise KeyStoreUnavailable so the caller rejects rather than treating a DB
 * outage as "unknown key" (which an attacker could otherwise use to probe, and which must never
 * fall through to allow).
 *
 * NOTE: table creation (dbDelta on activation) and key registration/rotation endpoints belong to the
 * activation/lifecycle and admin bricks. tableSchema() is the single source of truth for the DDL.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class WpdbKeyStore implements KeyStore {

	/** Byte capacity of the key_id column (controller-chosen identifier; ASCII). */
	public const KEY_ID_BYTES = 191;

	/** @var \wpdb */
	private $wpdb;

	/** @var string Fully-prefixed table name, e.g. wp_awbridge_keys. */
	private $table;

	/**
	 * @param \wpdb $wpdb injected, not reached for, so this stays testable.
	 */
	public function __construct( $wpdb ) {
		$this->wpdb  = $wpdb;
		$this->table = $wpdb->prefix . 'awbridge_keys';
	}

	/**
	 * @inheritDoc
	 */
	public function resolve( string $keyId ): ?KeyRecord {
		// An over-long key_id cannot match any stored row (the column can't hold it); short-circuit
		// without a query. Not a security boundary, just avoids a guaranteed-miss round trip.
		if ( strlen( $keyId ) > self::KEY_ID_BYTES ) {
			return null;
		}

		$sql = $this->wpdb->prepare(
			"SELECT key_id, public_key, scope, status, ip_allowlist FROM `{$this->table}` WHERE key_id = %s",
			$keyId
		);
		if ( ! is_string( $sql ) || $sql === '' ) {
			throw new KeyStoreUnavailable( 'key store prepare() failed' );
		}

		$row = $this->wpdb->get_row( $sql, ARRAY_A );

		if ( $row === null ) {
			// null = "no row" OR a query error. Distinguish via last_error so a DB outage fails closed
			// instead of masquerading as "unknown key".
			if ( (string) $this->wpdb->last_error !== '' ) {
				throw new KeyStoreUnavailable( 'key store SELECT failed: ' . (string) $this->wpdb->last_error );
			}
			return null;
		}

		return new KeyRecord(
			(string) $row['key_id'],
			(string) $row['public_key'],
			(string) $row['scope'],
			(string) $row['status'],
			$this->decodeIpAllowlist( isset( $row['ip_allowlist'] ) ? $row['ip_allowlist'] : null )
		);
	}

	/**
	 * Decode the ip_allowlist column (JSON array of strings) defensively: any malformed/empty value
	 * decodes to an empty list. NOTE an empty list means "any IP" in KeyRecord — so a CORRUPT value
	 * widens access. That is acceptable only because a separate guard (KeyRecord scope/status) still
	 * applies; if IP restriction must be strict, the admin brick should validate on write. Documented
	 * so the choice is explicit, not accidental.
	 *
	 * @param mixed $raw
	 * @return string[]
	 */
	private function decodeIpAllowlist( $raw ): array {
		if ( ! is_string( $raw ) || $raw === '' ) {
			return array();
		}
		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return array();
		}
		return array_values( array_filter( $decoded, 'is_string' ) );
	}

	/**
	 * Canonical DDL for the activation brick + db-expert review. dbDelta-compatible.
	 *
	 * @param string $prefix  $wpdb->prefix
	 * @param string $collate $wpdb->get_charset_collate()
	 */
	public static function tableSchema( string $prefix, string $collate ): string {
		$table = $prefix . 'awbridge_keys';
		return "CREATE TABLE `{$table}` (\n"
			. '  key_id VARBINARY(' . self::KEY_ID_BYTES . ") NOT NULL,\n"
			. "  public_key VARCHAR(64) NOT NULL,\n"
			. "  scope VARCHAR(16) NOT NULL,\n"
			. "  status VARCHAR(16) NOT NULL,\n"
			. "  ip_allowlist TEXT NULL,\n"
			. "  created_at BIGINT UNSIGNED NOT NULL,\n"
			. "  PRIMARY KEY  (key_id),\n"
			. "  KEY status (status)\n"
			. ") {$collate};";
	}
}
