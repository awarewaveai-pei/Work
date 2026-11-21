<?php
/**
 * Pure validation of the settings form (WP-free, unit-tested). WordPress-specific escaping happens at
 * output; this only decides what is a legal stored value.
 *
 * @package AwareWave\Oracle\Settings
 */

namespace AwareWave\Oracle\Settings;

final class Normalize {

	const KEY_ID_PATTERN = '/^[a-z0-9][a-z0-9_-]{2,63}$/';
	const SLUG_PATTERN   = '/^[a-z0-9][a-z0-9-]{0,39}$/';
	/** Engine locale codes look like en, zh-TW (BCP 47 subset). */
	const LOCALE_PATTERN = '/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/';
	/** WordPress locales look like en_US, zh_TW, de_DE_formal. */
	const WP_LOCALE_PATTERN = '/^[a-z]{2,3}(_[A-Za-z0-9]{2,8}){0,2}$/';

	/**
	 * An engine base URL: scheme://host[:port][/path], no query or fragment, no trailing slash.
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
		$port = isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '';
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

	public static function engineLocale( string $value ): string {
		$value = trim( $value );
		return preg_match( self::LOCALE_PATTERN, $value ) ? $value : '';
	}

	/**
	 * "left=right" lines -> map. Blank lines and lines starting with # are ignored; a line whose key or
	 * value fails its pattern is dropped (and reported in $rejected so the screen can say which).
	 *
	 * @param array<int,string> $rejected
	 * @return array<string,string>
	 */
	public static function pairs( string $text, string $keyPattern, string $valuePattern, array &$rejected = array() ): array {
		$out = array();
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
			$k = trim( substr( $line, 0, $eq ) );
			$v = trim( substr( $line, $eq + 1 ) );
			if ( ! preg_match( $keyPattern, $k ) || ! preg_match( $valuePattern, $v ) ) {
				$rejected[] = $line;
				continue;
			}
			$out[ $k ] = $v;
		}
		return $out;
	}

	/** @param array<string,string|int> $map */
	public static function pairsToText( array $map ): string {
		$lines = array();
		foreach ( $map as $k => $v ) {
			$lines[] = $k . '=' . $v;
		}
		return implode( "\n", $lines );
	}
}
