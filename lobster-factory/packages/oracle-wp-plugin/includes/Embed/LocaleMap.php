<?php
/**
 * WordPress locale -> engine locale (WP-free). Works with any translation plugin, because the caller
 * passes determine_locale(): the site's map (exact, then the language part: zh_TW -> zh), then the same
 * locale spelled the engine way (zh_TW -> zh-TW, en_US -> en), then the site default, then 'en'.
 * The result is always a language the engine serves.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

final class LocaleMap {

	/** @param array<string,string> $map WP locale (or bare language) => engine locale */
	public static function resolve( string $wpLocale, array $map, string $default ): string {
		$lang       = (string) strtok( $wpLocale, '_' );
		$candidates = array(
			$map[ $wpLocale ] ?? '',
			$map[ $lang ] ?? '',
			str_replace( '_', '-', $wpLocale ),
			$lang,
			$default,
		);
		foreach ( $candidates as $c ) {
			if ( in_array( $c, EmbedUrl::ENGINE_LOCALES, true ) ) {
				return $c;
			}
		}
		return EmbedUrl::FALLBACK_LOCALE;
	}
}
