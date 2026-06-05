<?php
/**
 * ArrayNonceStore — in-memory NonceStore for unit tests and ephemeral single-process use.
 *
 * Holds spent nonces in a plain array for the life of the PHP process. It is NOT for production
 * multi-request use (every request is a fresh process under PHP-FPM, so it would never see prior
 * nonces) — that is WpdbNonceStore's job. Its purpose is to let NonceCache's fail-closed and
 * replay logic be proven in isolation, the same way SignatureVerifier is tested WP-free.
 *
 * Atomicity here is trivially satisfied: a single PHP process is single-threaded, so the
 * isset()-then-assign sequence cannot interleave. (The real concurrency guarantee lives in
 * WpdbNonceStore via a PRIMARY KEY constraint.)
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class ArrayNonceStore implements NonceStore {

	/** @var array<string,int> nonce => expiresAt */
	private $seen = array();

	/**
	 * @inheritDoc
	 */
	public function remember( string $nonce, int $expiresAt ): bool {
		if ( isset( $this->seen[ $nonce ] ) ) {
			return false;
		}
		$this->seen[ $nonce ] = $expiresAt;
		return true;
	}

	/**
	 * Remove rows whose expiry has passed. Storage hygiene only — does not affect correctness
	 * (an expired nonce re-presented is already rejected by the upstream timestamp window).
	 *
	 * @return int number of rows pruned.
	 */
	public function pruneExpired( int $now ): int {
		$before = count( $this->seen );
		foreach ( $this->seen as $nonce => $expiresAt ) {
			if ( $expiresAt <= $now ) {
				unset( $this->seen[ $nonce ] );
			}
		}
		return $before - count( $this->seen );
	}
}
