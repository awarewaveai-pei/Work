<?php
/**
 * Run code with this plugin's strings in another language — for mail written in the subscriber's language
 * from a cron run or a request in another one. Only the plugin's own text domain is swapped, from its own
 * languages/ folder, so it works even when the site has no WordPress core language pack for that locale
 * (switch_to_locale() returns false then and changes nothing).
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

final class Lang {

	const DOMAIN = 'aware-wave-oracle';

	/**
	 * @template T
	 * @param callable():T $fn
	 * @return T
	 */
	public static function with( string $wpLocale, callable $fn ) {
		if ( $wpLocale === determine_locale() ) {
			return $fn();
		}
		unload_textdomain( self::DOMAIN, true );
		$mo     = AWORACLE_DIR . 'languages/' . self::DOMAIN . '-' . $wpLocale . '.mo';
		$source = null;
		if ( is_readable( $mo ) ) {
			load_textdomain( self::DOMAIN, $mo, $wpLocale );
		} else {
			// No file = the source language (English). Keep just-in-time loading from bringing the site's
			// own language back in: every string stays as written.
			$source = static function ( $translation, $text ) {
				return $text;
			};
			add_filter( 'gettext_' . self::DOMAIN, $source, PHP_INT_MAX, 2 );
		}
		try {
			return $fn();
		} finally {
			if ( $source ) {
				remove_filter( 'gettext_' . self::DOMAIN, $source, PHP_INT_MAX );
			}
			unload_textdomain( self::DOMAIN, true );
			load_plugin_textdomain( self::DOMAIN, false, dirname( plugin_basename( AWORACLE_FILE ) ) . '/languages' );
		}
	}
}
