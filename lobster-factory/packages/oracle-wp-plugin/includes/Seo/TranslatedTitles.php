<?php
/**
 * Page title and description in the page's language, on a site translated by TranslatePress (the free version
 * translates the body but not the head). The site's own dictionary is the only source, through TranslatePress's
 * trp_translate(); a string it has no translation for stays exactly as it was.
 *
 * A composed title ("page - site") is never in the dictionary, so its parts are translated before they are
 * joined (WordPress: document_title_parts; Rank Math: the %variable% values). The final filters cover text
 * written without variables. Nothing is hooked without TranslatePress.
 *
 * @package AwareWave\Oracle\Seo
 */

namespace AwareWave\Oracle\Seo;

final class TranslatedTitles {

	/** Rank Math variables whose value is text of this site (not numbers, dates or the separator). */
	const VARIABLES = array( '%title%', '%sitename%', '%sitedesc%', '%term%', '%excerpt%', '%excerpt_only%' );

	/** Rank Math's finished strings: <title>, meta description, Open Graph and Twitter. */
	const TEXT_FILTERS = array(
		'rank_math/frontend/title',
		'rank_math/frontend/description',
		'rank_math/opengraph/facebook/og_title',
		'rank_math/opengraph/facebook/og_description',
		'rank_math/opengraph/twitter/twitter_title',
		'rank_math/opengraph/twitter/twitter_description',
	);

	/** @var array<string,true> translations handed out in this request, entity-decoded */
	private static $done = array();

	/** On plugins_loaded, after TranslatePress has defined its functions (it does so at priority 1 or earlier). */
	public static function register(): void {
		if ( ! function_exists( 'trp_translate' ) ) {
			return;
		}
		add_filter( 'document_title_parts', array( self::class, 'parts' ), 20 );
		add_filter( 'rank_math/replacements', array( self::class, 'replacements' ), 20 );
		foreach ( self::TEXT_FILTERS as $hook ) {
			add_filter( $hook, array( self::class, 'text' ), 20 );
		}
	}

	/**
	 * @param mixed $parts WordPress's title parts (title, page, tagline, site).
	 * @return mixed
	 */
	public static function parts( $parts ) {
		return self::translateKeys( $parts, array( 'title', 'tagline', 'site' ) );
	}

	/**
	 * @param mixed $replacements '%variable%' => value.
	 * @return mixed
	 */
	public static function replacements( $replacements ) {
		return self::translateKeys( $replacements, self::VARIABLES );
	}

	/**
	 * @param mixed $text
	 * @return mixed
	 */
	public static function text( $text ) {
		if ( ! is_string( $text ) || trim( $text ) === '' || ! self::active() ) {
			return $text;
		}
		$plain = static function ( string $s ): string {
			return trim( html_entity_decode( $s, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		};
		// The same words pass several filters (variables, then <title>, then og/twitter). Nothing but our own
		// translations and punctuation left = already in the page's language; sending it again would make
		// TranslatePress register it as a new original in the default language (and maybe machine-translate it).
		if ( ! preg_match( '/\p{L}/u', str_replace( array_keys( self::$done ), '', $plain( $text ) ) ) ) {
			return $text;
		}
		// false: no <span data-no-translation> around the result -- it goes into <title> and attributes.
		$translated = trp_translate( $text, null, false );
		if ( ! is_string( $translated ) || trim( $translated ) === '' ) {
			return $text;
		}
		// Not translated: TranslatePress may still re-spell entities or spaces. Keep the original bytes.
		if ( $plain( $translated ) === $plain( $text ) ) {
			return $text;
		}
		self::$done[ $plain( $translated ) ] = true;
		return $translated;
	}

	/**
	 * @param mixed    $values
	 * @param string[] $keys
	 * @return mixed
	 */
	private static function translateKeys( $values, array $keys ) {
		if ( ! is_array( $values ) ) {
			return $values;
		}
		foreach ( $keys as $key ) {
			if ( isset( $values[ $key ] ) ) {
				$values[ $key ] = self::text( $values[ $key ] );
			}
		}
		return $values;
	}

	/**
	 * A front-end page in a language other than the site's default. Not the admin, not REST (it never reaches
	 * template_redirect), not feeds, not sitemaps, not the
	 * translation editor's preview (there TranslatePress wraps every string in its own markup).
	 */
	private static function active(): bool {
		global $TRP_LANGUAGE;
		if ( is_admin() || ! did_action( 'template_redirect' ) || is_feed() || get_query_var( 'sitemap' ) || trp_is_translation_editor( 'preview' ) ) {
			return false;
		}
		$settings = get_option( 'trp_settings' );
		$default  = is_array( $settings ) ? (string) ( $settings['default-language'] ?? '' ) : '';
		return $default !== '' && ! empty( $TRP_LANGUAGE ) && $TRP_LANGUAGE !== $default;
	}
}
