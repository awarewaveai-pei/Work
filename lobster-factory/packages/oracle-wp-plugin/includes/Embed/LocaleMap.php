<?php
/**
 * WordPress locale -> engine locale (WP-free). Works with any translation plugin, because the caller
 * passes determine_locale(): exact match, then the language part (zh_TW -> zh), then the site default,
 * then 'en'.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

final class LocaleMap {

	const FALLBACK = 'en';

	/** @param array<string,string> $map WP locale (or bare language) => engine locale */
	public static function resolve( string $wpLocale, array $map, string $default ): string {
		if ( isset( $map[ $wpLocale ] ) ) {
			return $map[ $wpLocale ];
		}
		$lang = strtok( $wpLocale, '_' );
		if ( is_string( $lang ) && isset( $map[ $lang ] ) ) {
			return $map[ $lang ];
		}
		return $default !== '' ? $default : self::FALLBACK;
	}
}
