<?php
/**
 * CachePurger — purges specific URLs from whatever cache layer fronts the site, so the post-write
 * render-verify reads fresh output instead of a stale cached page.
 *
 * Purge-by-URL (not purge-all): targeted, fast, and it keeps the rest of the site warm. Concrete
 * strategies (LiteSpeed hook, Redis object cache, Cloudflare API) implement this; the transaction
 * stays cache-agnostic. A purge that fails MUST throw — verifying against an unpurged cache would be
 * meaningless, so an unpurgeable URL is treated as verify-failure → rollback.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

interface CachePurger {

	/**
	 * @param string[] $urls
	 * @return string[] the URLs actually purged.
	 */
	public function purge( array $urls ): array;
}
