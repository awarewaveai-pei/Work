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

		// Pass the literal 'ARRAY_A' rather than the WP constant ARRAY_A: the constant's value IS the
		// string 'ARRAY_A', and using the literal keeps this class loadable (and unit-testable) when
		// WordPress core is not bootstrapped, instead of fataling on an undefined constant.
		$row = $this->wpdb->get_row( $sql, 'ARRAY_A' );

		if ( $row === null ) {
			// null = "no row" OR a query error. Distinguish via last_error so a DB outage fails closed
			// instead of masquerading as "unknown key".
			if ( (string) $this->wpdb->last_error !== '' ) {
				throw new KeyStoreUnavailable( 'key store SELECT failed: ' . (string) $this->wpdb->last_error );
			}
			return null;
		}

		// A non-null, non-array result is a store malformation (wrong output type, corrupted driver).
		// Fail closed rather than coercing missing columns to '' and returning a bogus empty record.
		if ( ! is_array( $row ) ) {
			throw new KeyStoreUnavailable( 'key store returned a non-array row' );
		}

		return new KeyRecord(
			(string) $row['key_id'],
			(string) $row['public_key'],
			(string) $row['scope'],
			(string) $row['status'],
			$this->decodeIpRestriction( isset( $row['ip_allowlist'] ) ? $row['ip_allowlist'] : null )
		);
	}

	/**
	 * Decode the ip_allowlist column into KeyRecord's nullable restriction, FAIL-CLOSED on corruption:
	 *   - NULL / empty column      -> null  (no restriction was set: any IP allowed — the common case)
	 *   - valid JSON array         -> that list of IP strings (an empty [] therefore denies every IP)
	 *   - non-empty but UNPARSEABLE -> empty array (deny all): a corrupt restriction must not silently
	 *                                 widen to "any IP". A key that WAS IP-restricted stays restricted
	 *                                 (to nothing) until the value is repaired, rather than opening up.
	 *
	 * @param mixed $raw
	 * @return string[]|null
	 */
	private function decodeIpRestriction( $raw ): ?array {
		if ( ! is_string( $raw ) || $raw === '' ) {
			return null; // no restriction configured -> any IP
		}
		$decoded = json_decode( $raw, true );
		if ( ! is_array( $decoded ) ) {
			return array(); // corrupt non-empty value -> deny all (fail closed), never "any IP"
		}
		return array_values( array_filter( $decoded, 'is_string' ) );
	}

	/**
	 * Structural self-check for the activation brick + /health, mirroring WpdbNonceStore's PK guard.
	 * If the deployed table is missing expected columns (a migration drifted, a legacy table), resolve()
	 * would coerce missing fields to '' and build degraded records — an authorization gate must not run
	 * on a malformed schema. The activation/lifecycle brick MUST call this and refuse to enable the
	 * bridge when it returns false.
	 *
	 * @return bool true iff every expected column is present on the deployed table.
	 */
	public function hasExpectedColumns(): bool {
		$rows = $this->wpdb->get_results( "SHOW COLUMNS FROM `{$this->table}`", 'ARRAY_A' );
		if ( ! is_array( $rows ) ) {
			return false;
		}
		$present  = array();
		foreach ( $rows as $r ) {
			if ( is_array( $r ) && isset( $r['Field'] ) ) {
				$present[ (string) $r['Field'] ] = true;
			}
		}
		foreach ( array( 'key_id', 'public_key', 'scope', 'status', 'ip_allowlist', 'created_at' ) as $col ) {
			if ( ! isset( $present[ $col ] ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Canonical DDL for the activation brick + db-expert review. dbDelta-compatible.
	 *
	 * @param string $prefix  $wpdb->prefix
	 * @param string $collate $wpdb->get_charset_collate()
	 */
	public static function tableSchema( string $prefix, string $collate ): string {
		$table = $prefix . 'awbridge_keys';
		// key_id is VARBINARY (not VARCHAR) so the PK match is byte-exact and case-sensitive — a
		// case-insensitive collation must never fold KeyA == keya. public_key is ASCII (base64), pinned
		// so a charset migration can't corrupt key material. created_at is BIGINT (epoch UTC).
		return "CREATE TABLE `{$table}` (\n"
			. '  key_id VARBINARY(' . self::KEY_ID_BYTES . ") NOT NULL,\n"
			. "  public_key VARCHAR(64) CHARACTER SET ascii NOT NULL,\n"
			. "  scope VARCHAR(16) NOT NULL,\n"
			. "  status VARCHAR(16) NOT NULL,\n"
			. "  ip_allowlist TEXT NULL,\n"
			. "  created_at BIGINT UNSIGNED NOT NULL,\n"
			. "  PRIMARY KEY  (key_id),\n"
			. "  KEY status (status)\n"
			. ") {$collate};";
	}
}
