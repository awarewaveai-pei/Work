<?php
/**
 * SummaryCache over WordPress transients, keyed by the WordPress user id.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class TransientSummaryCache implements SummaryCache {

	const PREFIX = 'awbridge_summary_';

	public function get( int $userId ): ?array {
		$v = get_transient( self::PREFIX . $userId );
		return is_array( $v ) ? $v : null;
	}

	public function set( int $userId, array $summary, int $ttl ): void {
		set_transient( self::PREFIX . $userId, $summary, $ttl );
	}

	public function forget( int $userId ): void {
		delete_transient( self::PREFIX . $userId );
	}
}
