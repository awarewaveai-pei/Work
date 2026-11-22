<?php
/**
 * The engine embed contract on the plugin side (WP-free). Engine side: ziwei-doushu
 * app/embed/[lang]/[slug]/page.tsx (languages = lib/i18n/config.ts locales; slugs = lib/site.ts PAGE_SLUGS;
 * root element id = ROOT_ID). Change both sides together.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

use AwareWave\Oracle\Settings\Normalize;

final class EmbedUrl {

	/** Engine embed page path: /embed/<engine locale>/<tool slug>. */
	const PATH_FORMAT = '/embed/%s/%s';
	/** Languages the engine serves; anything else falls back to FALLBACK_LOCALE (ORACLE-WP-SPEC §2-13). */
	const ENGINE_LOCALES  = array( 'zh-TW', 'en' );
	const FALLBACK_LOCALE = 'en';
	/** Element inside the embed page whose height is the tool's content height (same-origin mode measures it). */
	const ROOT_ID = 'aw-oracle-root';
	/** postMessage protocol version spoken by assets/embed.js (cross-origin mode only). */
	const PROTOCOL_VERSION = 1;

	public static function isSlug( string $slug ): bool {
		return (bool) preg_match( Normalize::SLUG_PATTERN, $slug );
	}

	/** Root-relative path (same-origin mode), or '' when any part is not legal. */
	public static function path( string $locale, string $slug ): string {
		if ( ! self::isSlug( $slug ) || Normalize::engineLocale( $locale ) === '' ) {
			return '';
		}
		return sprintf( self::PATH_FORMAT, rawurlencode( $locale ), $slug );
	}

	/** Full iframe src on another origin (cross-origin mode), or '' when any part is not legal. */
	public static function build( string $engineBase, string $locale, string $slug ): string {
		$path = self::path( $locale, $slug );
		return ( $engineBase === '' || $path === '' ) ? '' : $engineBase . $path;
	}

	/** scheme://host[:port] of a normalized engine URL — the only origin the parent page accepts messages from. */
	public static function origin( string $engineBase ): string {
		$p = parse_url( $engineBase );
		if ( ! is_array( $p ) || empty( $p['scheme'] ) || empty( $p['host'] ) ) {
			return '';
		}
		return $p['scheme'] . '://' . $p['host'] . ( isset( $p['port'] ) ? ':' . (int) $p['port'] : '' );
	}
}
