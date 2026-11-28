<?php
/**
 * Pure validation of the settings form (WP-free, unit-tested). WordPress-specific escaping happens at
 * output; this only decides what is a legal stored value.
 *
 * settings() is idempotent: WordPress runs the sanitize callback twice on the first save (update_option
 * finds no row and hands the already-clean value to add_option, which sanitizes again), so a stored value
 * fed back in must come out unchanged and report nothing.
 *
 * @package AwareWave\Oracle\Settings
 */

namespace AwareWave\Oracle\Settings;

use AwareWave\Oracle\Embed\EmbedUrl;
use AwareWave\Oracle\Embed\ThemeTokens;

final class Normalize {

	/** Same as the engine's SITE_KEY_ID (ziwei-doushu lib/sites/registry.ts): the engine rejects anything else. */
	const KEY_ID_PATTERN = '/^[a-z0-9][a-z0-9-]{1,23}$/';
	const SLUG_PATTERN   = '/^[a-z0-9][a-z0-9-]{0,39}$/';
	/** WordPress locales look like en_US, zh_TW, de_DE_formal; a bare language (zh) is also accepted as a map key. */
	const WP_LOCALE_PATTERN = '/^[a-z]{2,3}(_[A-Za-z0-9]{2,8}){0,2}$/';
	const PAGE_ID_PATTERN   = '/^[1-9][0-9]{0,18}$/';
	/** Cloudflare Turnstile keys: "0x…" live, "1x…"/"2x…"/"3x…" Cloudflare's published test keys. */
	const TURNSTILE_KEY_PATTERN = '/^[0-9]x[A-Za-z0-9_-]{10,80}$/';

	const EMBED_SAME_ORIGIN  = 'same-origin';
	const EMBED_CROSS_ORIGIN = 'cross-origin';

	/** Daily letter sender (ORACLE-WP-SPEC §2-9). none = no signup block, no sending. */
	const MAILER_FLUENTCRM = 'fluentcrm';
	const MAILER_NONE      = 'none';

	/**
	 * Path prefixes the engine owns on a same-origin install (ORACLE-WP-SPEC §2-1): the reverse proxy sends
	 * them to the engine, so a WordPress page or language slug there is unreachable.
	 */
	const ENGINE_PREFIXES = array( 'embed', 'api', '_next', 'tarot', 'zh-TW', 'en' );

	/**
	 * The whole settings array. Accepts the form post (maps as "k=v" text) or a stored value (maps as
	 * arrays); returns the stored shape. $errors gets [code, plain-text detail] pairs; the caller words,
	 * escapes and shows them.
	 *
	 * @param array<string,mixed>                 $in
	 * @param array<int,array{0:string,1:string}> $errors
	 * @return array{embed:string,browser_engine_url:string,server_engine_url:string,key_id:string,default_locale:string,locale_map:array<string,string>,page_map:array<string,int>,mailer:string,turnstile_site_key:string,fluentform_id:int,theme_map:array<string,string>}
	 */
	public static function settings( array $in, array &$errors = array() ): array {
		$out = Options::defaults();

		// Cross-origin is not supported yet (the engine allows only same-origin frames and has no message
		// protocol): a request for it is reported and same-origin is stored.
		$embedRaw     = self::scalar( $in['embed'] ?? '' );
		$out['embed'] = self::EMBED_SAME_ORIGIN;
		if ( $embedRaw === self::EMBED_CROSS_ORIGIN ) {
			$errors[] = array( 'cross_unsupported', '' );
		}

		$browserRaw                = self::scalar( $in['browser_engine_url'] ?? '' );
		$out['browser_engine_url'] = self::engineUrl( $browserRaw, false );
		if ( $out['browser_engine_url'] === '' && trim( $browserRaw ) !== '' ) {
			$errors[] = array( 'browser_url', '' );
		}
		$serverRaw                = self::scalar( $in['server_engine_url'] ?? '' );
		$out['server_engine_url'] = self::engineUrl( $serverRaw, true );
		if ( $out['server_engine_url'] === '' && trim( $serverRaw ) !== '' ) {
			$errors[] = array( 'server_url', '' );
		}
		$keyRaw        = self::scalar( $in['key_id'] ?? '' );
		$out['key_id'] = self::keyId( $keyRaw );
		if ( $out['key_id'] === '' && trim( $keyRaw ) !== '' ) {
			$errors[] = array( 'key_id', '' );
		}
		$defaultRaw            = self::scalar( $in['default_locale'] ?? '' );
		$default               = self::engineLocale( $defaultRaw );
		$out['default_locale'] = $default !== '' ? $default : EmbedUrl::FALLBACK_LOCALE;
		if ( $default === '' && trim( $defaultRaw ) !== '' ) {
			$errors[] = array( 'default_locale', '' );
		}

		$out['mailer'] = self::scalar( $in['mailer'] ?? '' ) === self::MAILER_FLUENTCRM ? self::MAILER_FLUENTCRM : self::MAILER_NONE;

		// A stored value comes back as an int on the second sanitize pass; the form posts text.
		$formRaw              = is_int( $in['fluentform_id'] ?? null ) ? (string) $in['fluentform_id'] : trim( self::scalar( $in['fluentform_id'] ?? '' ) );
		$out['fluentform_id'] = preg_match( self::PAGE_ID_PATTERN, $formRaw ) ? (int) $formRaw : 0;

		// A ticked box posts "1"; a stored value comes back as a bool. Anything else is off.
		$keep                           = $in['fluentform_keep_entries'] ?? false;
		$out['fluentform_keep_entries'] = $keep === true || $keep === 1 || $keep === '1';

		$turnstileRaw              = self::scalar( $in['turnstile_site_key'] ?? '' );
		$out['turnstile_site_key'] = self::turnstileKey( $turnstileRaw );
		if ( $out['turnstile_site_key'] === '' && trim( $turnstileRaw ) !== '' ) {
			$errors[] = array( 'turnstile_site_key', '' );
		}

		$rejected          = array();
		$out['locale_map'] = self::pairs( $in['locale_map'] ?? '', self::WP_LOCALE_PATTERN, null, $rejected );
		$pages             = self::pairs( $in['page_map'] ?? '', self::SLUG_PATTERN, self::PAGE_ID_PATTERN, $rejected );
		$out['page_map']   = array_map( 'intval', $pages );
		if ( $rejected ) {
			$errors[] = array( 'maps', implode( ' | ', $rejected ) );
		}

		$themeRejected    = array();
		$out['theme_map'] = self::pairs( $in['theme_map'] ?? '', ThemeTokens::TOKEN_PATTERN, ThemeTokens::SLUG_PATTERN, $themeRejected );
		if ( $themeRejected ) {
			$errors[] = array( 'theme_map', implode( ' | ', $themeRejected ) );
		}
		return $out;
	}

	/**
	 * An engine base URL: scheme://host[:port][/path], no query or fragment, no trailing slash, no default
	 * port (a browser reports https://x, never https://x:443, as a message origin).
	 * $allowPlainHttp: the server-side URL may be an internal address (e.g. a container on a private
	 * network); the browser URL must be https unless the host is local (localhost, *.localhost, *.test, 127.0.0.1).
	 */
	public static function engineUrl( string $value, bool $allowPlainHttp ): string {
		$value = trim( $value );
		if ( $value === '' ) {
			return '';
		}
		$parts = parse_url( $value );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}
		if ( isset( $parts['query'] ) || isset( $parts['fragment'] ) || isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return '';
		}
		$scheme = strtolower( $parts['scheme'] );
		$host   = strtolower( $parts['host'] );
		if ( $scheme !== 'https' && ! ( $scheme === 'http' && ( $allowPlainHttp || self::isLocalHost( $host ) ) ) ) {
			return '';
		}
		$port = isset( $parts['port'] ) ? (int) $parts['port'] : 0;
		$port = ( $port === 0 || ( $scheme === 'https' && $port === 443 ) || ( $scheme === 'http' && $port === 80 ) ) ? '' : ':' . $port;
		$path = isset( $parts['path'] ) ? rtrim( $parts['path'], '/' ) : '';
		return $scheme . '://' . $host . $port . $path;
	}

	public static function isLocalHost( string $host ): bool {
		return $host === 'localhost' || $host === '127.0.0.1' || $host === '[::1]'
			|| substr( $host, -10 ) === '.localhost' || substr( $host, -5 ) === '.test';
	}

	public static function keyId( string $value ): string {
		$value = strtolower( trim( $value ) );
		return preg_match( self::KEY_ID_PATTERN, $value ) ? $value : '';
	}

	/** A Turnstile site key or secret, or '' when it does not look like one. */
	public static function turnstileKey( string $value ): string {
		$value = trim( $value );
		return preg_match( self::TURNSTILE_KEY_PATTERN, $value ) ? $value : '';
	}

	/** Only languages the engine serves (EmbedUrl::ENGINE_LOCALES); anything else is ''. */
	public static function engineLocale( string $value ): string {
		$value = trim( $value );
		return in_array( $value, EmbedUrl::ENGINE_LOCALES, true ) ? $value : '';
	}

	/**
	 * "left=right" lines (or an already-stored map) -> map. Blank lines and lines starting with # are
	 * ignored; a line whose key or value fails is dropped and reported in $rejected (plain text).
	 * $valuePattern null = the value must be an engine locale.
	 *
	 * @param mixed             $input string from the form, or array<string,string|int> when re-sanitizing a stored value
	 * @param array<int,string> $rejected
	 * @return array<string,string>
	 */
	public static function pairs( $input, string $keyPattern, ?string $valuePattern, array &$rejected = array() ): array {
		$text = is_array( $input ) ? self::pairsToText( $input ) : self::scalar( $input );
		$out  = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $text ) as $line ) {
			$line = trim( $line );
			if ( $line === '' || $line[0] === '#' ) {
				continue;
			}
			$eq = strpos( $line, '=' );
			if ( $eq === false ) {
				$rejected[] = $line;
				continue;
			}
			$k  = trim( substr( $line, 0, $eq ) );
			$v  = trim( substr( $line, $eq + 1 ) );
			$ok = $valuePattern === null ? self::engineLocale( $v ) !== '' : (bool) preg_match( $valuePattern, $v );
			if ( ! preg_match( $keyPattern, $k ) || ! $ok ) {
				$rejected[] = $line;
				continue;
			}
			$out[ $k ] = $v;
		}
		return $out;
	}

	/** @param array<mixed> $map */
	public static function pairsToText( array $map ): string {
		$lines = array();
		foreach ( $map as $k => $v ) {
			if ( is_scalar( $v ) ) {
				$lines[] = $k . '=' . $v;
			}
		}
		return implode( "\n", $lines );
	}

	/**
	 * True when a URL path (as the browser sends it, from the domain root) starts with an engine prefix.
	 * Case-insensitive on purpose: warns about /Tarot/ too, which is at best confusing next to /tarot/.
	 */
	public static function pathHitsEnginePrefix( string $path ): bool {
		$first = strtolower( (string) strtok( ltrim( $path, '/' ), '/' ) );
		foreach ( self::ENGINE_PREFIXES as $prefix ) {
			if ( $first === strtolower( $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/** @param mixed $v */
	private static function scalar( $v ): string {
		return is_scalar( $v ) ? (string) $v : '';
	}
}
