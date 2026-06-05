<?php
/**
 * ArrayKeyStore — in-memory KeyStore for unit tests and fixtures.
 *
 * Lets the Router's authorization logic (scope / status / IP) be exercised without a database,
 * the same way ArrayNonceStore supports NonceCache. Not for production: a real deployment resolves
 * keys from the DB (WpdbKeyStore) so registration/rotation survive process restarts.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class ArrayKeyStore implements KeyStore {

	/** @var array<string,KeyRecord> keyId => record */
	private $records = array();

	/**
	 * @param KeyRecord[] $records seed records (optional).
	 */
	public function __construct( array $records = array() ) {
		foreach ( $records as $record ) {
			if ( $record instanceof KeyRecord ) {
				$this->records[ $record->keyId() ] = $record;
			}
		}
	}

	public function add( KeyRecord $record ): void {
		$this->records[ $record->keyId() ] = $record;
	}

	/**
	 * @inheritDoc
	 */
	public function resolve( string $keyId ): ?KeyRecord {
		return isset( $this->records[ $keyId ] ) ? $this->records[ $keyId ] : null;
	}
}
