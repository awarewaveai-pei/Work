<?php
/**
 * One renderer for the shortcode and the block: an iframe to <browser engine URL>/embed/<lang>/<tool>
 * plus the parent-page script (assets/embed.js) that speaks protocol v1. The script gets its config
 * once per page (engine origin, locale, member flag, login URL, tool → page URLs).
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

use AwareWave\Oracle\Settings\Options;

final class Renderer {

	const SCRIPT = 'aworacle-embed';

	/** @var bool */
	private static $configured = false;

	public static function render( string $tool ): string {
		$tool = sanitize_key( $tool );
		$s    = Options::get();
		$src  = EmbedUrl::build( $s['browser_engine_url'], self::locale(), $tool );
		if ( $src === '' ) {
			// Only people who can fix it see why nothing renders.
			return current_user_can( 'manage_options' )
				? '<p class="aworacle-error">' . esc_html__( 'AwareWave Oracle: set the engine URL in Settings → AwareWave Oracle and use a valid tool name.', 'aware-wave-oracle' ) . '</p>'
				: '';
		}
		self::enqueue( $s );
		/* translators: %s: tool name, e.g. ziwei */
		$title = sprintf( __( 'AwareWave Oracle: %s', 'aware-wave-oracle' ), $tool );
		return '<div class="aworacle-embed" data-aworacle-tool="' . esc_attr( $tool ) . '">'
			. '<iframe src="' . esc_url( $src ) . '" title="' . esc_attr( $title ) . '" loading="lazy"'
			. ' referrerpolicy="strict-origin-when-cross-origin" style="width:100%;min-height:600px;border:0;display:block"></iframe>'
			. '</div>';
	}

	public static function locale(): string {
		$s = Options::get();
		return LocaleMap::resolve( determine_locale(), $s['locale_map'], $s['default_locale'] );
	}

	/** @param array<string,mixed> $s */
	private static function enqueue( array $s ): void {
		wp_enqueue_script( self::SCRIPT, AWORACLE_URL . 'assets/embed.js', array(), AWORACLE_VERSION, true );
		if ( self::$configured ) {
			return;
		}
		self::$configured = true;
		$pages = array();
		foreach ( $s['page_map'] as $slug => $pageId ) {
			$url = get_permalink( (int) $pageId );
			if ( $url ) {
				$pages[ $slug ] = $url;
			}
		}
		$config = array(
			'v'            => EmbedUrl::PROTOCOL_VERSION,
			'engineOrigin' => EmbedUrl::origin( $s['browser_engine_url'] ),
			'locale'       => self::locale(),
			'member'       => is_user_logged_in(),
			'loginUrl'     => wp_login_url( get_permalink() ?: home_url( '/' ) ),
			'pages'        => (object) $pages,
		);
		wp_add_inline_script( self::SCRIPT, 'window.AWORACLE=' . wp_json_encode( $config ) . ';', 'before' );
	}
}
