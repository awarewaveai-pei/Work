<?php
/**
 * The engine embed contract on the plugin side (WP-free). The engine half (W2: /embed/<lang>/<slug>,
 * postMessage protocol v1) is not built yet; these constants are the assumed interface — change them
 * here and in assets/embed.js together when W2 lands.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

use AwareWave\Oracle\Settings\Normalize;

final class EmbedUrl {

	/** Engine embed page: <browser engine URL>/embed/<engine locale>/<tool slug>. */
	const PATH_FORMAT = '/embed/%s/%s';
	/** postMessage protocol version this plugin speaks (messages oracle:ready/init/resize/…). */
	const PROTOCOL_VERSION = 1;

	public static function isSlug( string $slug ): bool {
		return (bool) preg_match( Normalize::SLUG_PATTERN, $slug );
	}

	/** Full iframe src, or '' when any part is not legal (never builds a URL from unchecked input). */
	public static function build( string $engineBase, string $locale, string $slug ): string {
		if ( $engineBase === '' || ! self::isSlug( $slug ) || Normalize::engineLocale( $locale ) === '' ) {
			return '';
		}
		return $engineBase . sprintf( self::PATH_FORMAT, rawurlencode( $locale ), $slug );
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
