<?php
/**
 * Reads this site's theme as the engine's host-theme tokens and hands them to the embed URL as
 * aw-<token>=<value>. The tokens ARE Kadence's global settings: palette1…palette9 (Kadence's --global-paletteN),
 * body font, heading font, button radius (engine contract: ziwei-doushu lib/theme/hostTheme.ts, deploy/DEPLOY.md
 * "宿主主題代碼", with the table of where each slot shows in the tools). Read on every render, so a change in the
 * Customizer reaches the tools without a new plugin release. Nothing found = nothing sent = the engine keeps its
 * own look.
 *  - Kadence active: its active global palette slot for slot (option kadence_global_palette;
 *    KADENCE_DEFAULT_PALETTE while never saved), fonts from base_font / heading_font, radius from
 *    buttons_border_radius. Web fonts: assets/embed-same-origin.js copies the page's same-origin @font-face
 *    rules into the frame (the engine CSP allows fonts from this origin only).
 *  - Any other theme: theme.json global styles (wp_get_global_styles) mapped onto the nine slots through
 *    GLOBAL_STYLE_PATHS, resolved against the palette and font presets (wp_get_global_settings).
 *  - Setting theme_map (paletteN=site palette slug lines) fills or replaces single slots on either path.
 * Values are filtered here with the same rules the engine applies (the engine re-validates; this only keeps
 * junk out of the URL).
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

final class ThemeTokens {

	/** Same tokens, same order as the engine's THEME_TOKENS. Change both sides together. */
	const TOKENS = array( 'palette1', 'palette2', 'palette3', 'palette4', 'palette5', 'palette6', 'palette7', 'palette8', 'palette9', 'body-font', 'heading-font', 'button-radius' );
	const COLOR_TOKENS = array( 'palette1', 'palette2', 'palette3', 'palette4', 'palette5', 'palette6', 'palette7', 'palette8', 'palette9' );
	const QUERY_PREFIX = 'aw-';

	/**
	 * Kadence's built-in palette (components/color_palette defaults), used while the site has never saved one:
	 * Kadence does not store kadence_global_palette until the palette is changed in the Customizer.
	 */
	const KADENCE_DEFAULT_PALETTE = array(
		'palette1' => '#3182CE',
		'palette2' => '#2B6CB0',
		'palette3' => '#1A202C',
		'palette4' => '#2D3748',
		'palette5' => '#4A5568',
		'palette6' => '#718096',
		'palette7' => '#EDF2F7',
		'palette8' => '#F7FAFC',
		'palette9' => '#ffffff',
	);

	/**
	 * theme.json global-styles path per slot, for themes that are not Kadence, by the same slot meaning
	 * (1 button = accent, 2 link = second accent, 3 heading text, 4 body text, 9 background). Slots with no
	 * theme.json counterpart (5–8) are derived by the engine or set with theme_map.
	 */
	const GLOBAL_STYLE_PATHS = array(
		'palette9'      => array( 'color', 'background' ),
		'palette4'      => array( 'color', 'text' ),
		'palette3'      => array( 'elements', 'heading', 'color', 'text' ),
		'palette1'      => array( 'elements', 'button', 'color', 'background' ),
		'palette2'      => array( 'elements', 'link', 'color', 'text' ),
		'body-font'     => array( 'typography', 'fontFamily' ),
		'heading-font'  => array( 'elements', 'heading', 'typography', 'fontFamily' ),
		'button-radius' => array( 'elements', 'button', 'border', 'radius' ),
	);

	const TOKEN_PATTERN = '/^palette[1-9]$/';
	const SLUG_PATTERN  = '/^[a-z0-9][a-z0-9_-]{0,39}$/';

	private const HEX    = '/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i';
	private const NUM    = '-?(?:\d{1,3}(?:\.\d{1,4})?|\.\d{1,4})(?:%|deg)?';
	private const LENGTH = '/^(?:0|\d{1,3}(?:\.\d{1,2})?(?:px|rem|em))$/';
	private const FAMILY = '/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,63}$/u';
	private const GENERIC  = array( 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded' );
	private const RESERVED = array( 'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'default' );

	/** @var array<string,string>|null tokens for this request */
	private static $cache = null;

	// ---------------------------------------------------------------- WordPress side

	/**
	 * This site's tokens (validated), or [] when the theme gives nothing usable.
	 *
	 * @param array<string,string> $overrides theme_map setting: token => palette slug
	 * @return array<string,string>
	 */
	public static function read( array $overrides ): array {
		if ( self::$cache !== null ) {
			return self::$cache;
		}
		if ( function_exists( 'get_template' ) && get_template() === 'kadence' ) {
			$mods = array(
				'base_font'    => self::kadenceOption( 'base_font' ),
				'heading_font' => self::kadenceOption( 'heading_font' ),
				'radius'       => self::kadenceOption( 'buttons_border_radius' ),
			);
			$palette     = self::kadencePalette( get_option( 'kadence_global_palette', '' ) );
			self::$cache = self::fromKadence( $palette ? $palette : self::KADENCE_DEFAULT_PALETTE, $overrides, $mods );
		} elseif ( function_exists( 'wp_get_global_styles' ) && function_exists( 'wp_get_global_settings' ) ) {
			$raw = array();
			foreach ( self::GLOBAL_STYLE_PATHS as $token => $path ) {
				$raw[ $token ] = wp_get_global_styles( $path );
			}
			self::$cache = self::fromGlobalStyles(
				$raw,
				self::presets( wp_get_global_settings( array( 'color', 'palette' ) ), 'color' ),
				self::presets( wp_get_global_settings( array( 'typography', 'fontFamilies' ) ), 'fontFamily' ),
				$overrides
			);
		} else {
			self::$cache = array();
		}
		return self::$cache;
	}

	/**
	 * A Kadence setting as the site sees it: saved value or Kadence's own default. Kadence stores nothing until
	 * a setting is changed, so get_theme_mod() alone returns false on a fresh site; kadence()->option() merges
	 * its defaults. Falls back to the stored theme mod when the Kadence API is not there.
	 *
	 * @return mixed
	 */
	private static function kadenceOption( string $key ) {
		if ( function_exists( '\Kadence\kadence' ) ) {
			$k = \Kadence\kadence();
			if ( is_object( $k ) && is_callable( array( $k, 'option' ) ) ) {
				return $k->option( $key );
			}
		}
		return get_theme_mod( $key );
	}

	/** Query arguments for the embed URL (empty array = append nothing). @param array<string,string> $tokens */
	public static function query( array $tokens ): array {
		$q = array();
		foreach ( self::TOKENS as $t ) {
			if ( isset( $tokens[ $t ] ) ) {
				$q[ self::QUERY_PREFIX . $t ] = $tokens[ $t ];
			}
		}
		return $q;
	}

	/** $path plus ?aw-…=… (RFC 3986 encoding), or $path unchanged when there are no tokens. */
	public static function withQuery( string $path, array $tokens ): string {
		$q = self::query( $tokens );
		if ( $path === '' || ! $q ) {
			return $path;
		}
		return $path . ( strpos( $path, '?' ) === false ? '?' : '&' ) . http_build_query( $q, '', '&', PHP_QUERY_RFC3986 );
	}

	// ---------------------------------------------------------------- pure (unit-tested)

	/**
	 * Kadence stores its palettes as a JSON string: {"palette":[{"color":"#…","slug":"palette1"},…],
	 * "second-palette":[…],"third-palette":[…],"active":"palette"}. Returns slug => colour of the active one.
	 *
	 * @param mixed $option
	 * @return array<string,string>
	 */
	public static function kadencePalette( $option ): array {
		$data = is_string( $option ) ? json_decode( $option, true ) : $option;
		if ( ! is_array( $data ) ) {
			return array();
		}
		$active = isset( $data['active'] ) && is_string( $data['active'] ) && isset( $data[ $data['active'] ] ) ? $data['active'] : 'palette';
		$list   = isset( $data[ $active ] ) && is_array( $data[ $active ] ) ? $data[ $active ] : array();
		$out    = array();
		foreach ( $list as $entry ) {
			if ( is_array( $entry ) && isset( $entry['slug'], $entry['color'] ) && is_string( $entry['slug'] ) && is_string( $entry['color'] ) ) {
				$out[ $entry['slug'] ] = trim( $entry['color'] );
			}
		}
		return $out;
	}

	/**
	 * @param array<string,string> $palette   slug => colour
	 * @param array<string,string> $overrides slot => Kadence palette slug (replaces that slot)
	 * @param array<string,mixed>  $mods      base_font, heading_font, radius (theme mods as stored)
	 * @return array<string,string>
	 */
	public static function fromKadence( array $palette, array $overrides, array $mods ): array {
		if ( ! $palette ) {
			return array();
		}
		$raw = array();
		$slots = array();
		foreach ( self::COLOR_TOKENS as $slot ) {
			$slots[ $slot ] = $slot; // Kadence: slot N is palette N
		}
		foreach ( array_merge( $slots, self::validOverrides( $overrides ) ) as $token => $slug ) {
			if ( isset( $palette[ $slug ] ) ) {
				$raw[ $token ] = $palette[ $slug ];
			}
		}
		$base    = self::familyOf( $mods['base_font'] ?? null );
		$heading = self::familyOf( $mods['heading_font'] ?? null );
		$raw['body-font']     = $base;
		$raw['heading-font']  = ( $heading === '' || in_array( strtolower( $heading ), self::RESERVED, true ) ) ? $base : $heading;
		$raw['button-radius'] = self::kadenceRadius( $mods['radius'] ?? null );
		return self::clean( $raw );
	}

	/**
	 * @param array<string,mixed>  $raw       token => global-styles value (preset reference or literal)
	 * @param array<string,string> $palette   colour slug => colour
	 * @param array<string,string> $fonts     font slug => font-family
	 * @param array<string,string> $overrides token => colour slug
	 * @return array<string,string>
	 */
	public static function fromGlobalStyles( array $raw, array $palette, array $fonts, array $overrides ): array {
		$out = array();
		foreach ( $raw as $token => $value ) {
			if ( ! is_string( $value ) || $value === '' ) {
				continue;
			}
			$out[ $token ] = self::resolvePreset( $value, $token === 'body-font' || $token === 'heading-font' ? $fonts : $palette );
		}
		foreach ( self::validOverrides( $overrides ) as $token => $slug ) {
			if ( isset( $palette[ $slug ] ) ) {
				$out[ $token ] = $palette[ $slug ];
			}
		}
		return self::clean( $out );
	}

	/**
	 * Keeps only values the engine accepts; fonts are reduced to their usable families (Kadence's system
	 * stack starts with -apple-system, which the engine does not accept, so it is dropped, not the whole stack).
	 *
	 * @param array<string,mixed> $raw
	 * @return array<string,string>
	 */
	public static function clean( array $raw ): array {
		$out = array();
		foreach ( self::TOKENS as $t ) {
			$v = isset( $raw[ $t ] ) && is_string( $raw[ $t ] ) ? trim( $raw[ $t ] ) : '';
			if ( $v === '' ) {
				continue;
			}
			if ( in_array( $t, self::COLOR_TOKENS, true ) ) {
				$v = self::color( $v );
			} elseif ( $t === 'button-radius' ) {
				$v = preg_match( self::LENGTH, $v ) ? $v : '';
			} else {
				$v = self::font( $v );
			}
			if ( $v !== '' ) {
				$out[ $t ] = $v;
			}
		}
		return $out;
	}

	public static function color( string $v ): string {
		$v = trim( $v );
		if ( strlen( $v ) > 120 ) {
			return '';
		}
		$n    = self::NUM;
		$fn   = '/^(?:rgba?|hsla?)\(\s*' . $n . '(?:\s*,\s*' . $n . '){2}(?:\s*,\s*' . $n . ')?\s*\)$/i';
		$sp   = '/^(?:rgba?|hsla?)\(\s*' . $n . '(?:\s+' . $n . '){2}(?:\s*\/\s*' . $n . ')?\s*\)$/i';
		return ( preg_match( self::HEX, $v ) || preg_match( $fn, $v ) || preg_match( $sp, $v ) ) ? $v : '';
	}

	/** Up to 4 usable families, quotes stripped (the engine adds its own). */
	public static function font( string $v ): string {
		$out = array();
		foreach ( explode( ',', $v ) as $part ) {
			$f = trim( trim( trim( $part ), '"\'' ) );
			if ( $f === '' || ! preg_match( self::FAMILY, $f ) || in_array( strtolower( $f ), self::RESERVED, true ) ) {
				continue;
			}
			$out[] = in_array( strtolower( $f ), self::GENERIC, true ) ? strtolower( $f ) : $f;
			if ( count( $out ) === 4 ) {
				break;
			}
		}
		return implode( ', ', $out );
	}

	/** @param array<string,mixed> $map @return array<string,string> */
	private static function validOverrides( array $map ): array {
		$out = array();
		foreach ( $map as $token => $slug ) {
			if ( is_string( $token ) && is_string( $slug ) && preg_match( self::TOKEN_PATTERN, $token ) && preg_match( self::SLUG_PATTERN, $slug ) ) {
				$out[ $token ] = $slug;
			}
		}
		return $out;
	}

	/** @param mixed $font Kadence typography theme mod */
	private static function familyOf( $font ): string {
		return is_array( $font ) && isset( $font['family'] ) && is_string( $font['family'] ) ? $font['family'] : '';
	}

	/**
	 * Kadence keeps sizes per device: {"size":{"desktop":3},"unit":{"desktop":"px"}}, or a plain size/unit,
	 * or a 4-corner list. The desktop value (first corner) is the base radius.
	 *
	 * @param mixed $mod
	 */
	private static function kadenceRadius( $mod ): string {
		if ( is_int( $mod ) || is_float( $mod ) || ( is_string( $mod ) && is_numeric( $mod ) ) ) {
			return ( (float) $mod ) . 'px';
		}
		if ( ! is_array( $mod ) || ! isset( $mod['size'] ) ) {
			return '';
		}
		$size = $mod['size'];
		if ( is_array( $size ) ) {
			$size = $size['desktop'] ?? ( array_values( $size )[0] ?? null );
		}
		$unit = $mod['unit'] ?? 'px';
		if ( is_array( $unit ) ) {
			$unit = $unit['desktop'] ?? ( array_values( $unit )[0] ?? 'px' );
		}
		if ( ! is_numeric( $size ) || ! in_array( $unit, array( 'px', 'rem', 'em' ), true ) ) {
			return '';
		}
		return ( (float) $size ) . $unit;
	}

	/**
	 * "var:preset|color|base" or "var(--wp--preset--color--base)" → the preset's value; a literal passes through.
	 *
	 * @param array<string,string> $presets slug => value
	 */
	private static function resolvePreset( string $value, array $presets ): string {
		if ( preg_match( '/^var:preset\|[a-z-]+\|([a-z0-9_-]+)$/', $value, $m ) || preg_match( '/^var\(--wp--preset--[a-z-]+--([a-z0-9_-]+)\)$/', $value, $m ) ) {
			return $presets[ $m[1] ] ?? '';
		}
		return $value;
	}

	/**
	 * wp_get_global_settings() presets ({default:[…], theme:[…], custom:[…]} or a flat list) → slug => field.
	 * Later origins win (custom over theme over default), as in WordPress.
	 *
	 * @param mixed $settings
	 * @return array<string,string>
	 */
	public static function presets( $settings, string $field ): array {
		if ( ! is_array( $settings ) ) {
			return array();
		}
		$lists = isset( $settings[0] ) ? array( $settings ) : array( $settings['default'] ?? array(), $settings['theme'] ?? array(), $settings['custom'] ?? array() );
		$out   = array();
		foreach ( $lists as $list ) {
			foreach ( is_array( $list ) ? $list : array() as $p ) {
				if ( is_array( $p ) && isset( $p['slug'], $p[ $field ] ) && is_string( $p['slug'] ) && is_string( $p[ $field ] ) ) {
					$out[ $p['slug'] ] = $p[ $field ];
				}
			}
		}
		return $out;
	}
}
