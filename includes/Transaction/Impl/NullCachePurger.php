<?php
/**
 * NullCachePurger — the "no cache layer" CacheStrategy. Returns the URLs unchanged. Used on sites
 * with no page cache (local dev, plain Nginx without a cache plugin). The HttpRenderer's cache-bust
 * query arg still ensures fresh reads. Real strategies (LiteSpeed / Redis / Cloudflare) replace this.
 *
 * @package AwareWave\WpBridge\Transaction\Impl
 */

namespace AwareWave\WpBridge\Transaction\Impl;

use AwareWave\WpBridge\Transaction\CachePurger;

final class NullCachePurger implements CachePurger {

	public function purge( array $urls ): array {
		return $urls;
	}
}
