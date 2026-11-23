<?php
/**
 * Where a member's summary is kept for 60 seconds. Production: TransientSummaryCache.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

interface SummaryCache {

	/** @return array|null the stored summary, or null when none or expired. */
	public function get( int $userId ): ?array;

	public function set( int $userId, array $summary, int $ttl ): void;

	public function forget( int $userId ): void;
}
