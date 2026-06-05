<?php
/**
 * RenderObservation — what a cache-bypassing render of one URL saw: HTTP status + a content hash.
 *
 * The transaction compares observations before/after a write to decide whether the change actually
 * took effect AND did not break the page. A non-2xx status or an unexpected hash is treated as
 * "verify failed" → rollback. The hash is over a stable structural marker, not volatile full HTML,
 * so trivial dynamic noise (nonces, timestamps) doesn't cause false rollbacks (DESIGN §I risk 1).
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

final class RenderObservation {

	/** @var string */
	private $url;
	/** @var int HTTP status from the cache-bypassing render. */
	private $httpStatus;
	/** @var string content hash of the rendered (stable) output. */
	private $hash;

	public function __construct( string $url, int $httpStatus, string $hash ) {
		$this->url        = $url;
		$this->httpStatus = $httpStatus;
		$this->hash       = $hash;
	}

	public function url(): string {
		return $this->url;
	}

	public function httpStatus(): int {
		return $this->httpStatus;
	}

	public function hash(): string {
		return $this->hash;
	}

	/** A render is "healthy" iff it returned a 2xx status. */
	public function isHealthy(): bool {
		return $this->httpStatus >= 200 && $this->httpStatus < 300;
	}
}
