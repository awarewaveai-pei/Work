<?php
/**
 * One renderer for the shortcode and the block. Two embed modes (setting "embed"):
 *  - same-origin (default): <iframe src="/embed/<lang>/<tool>"> on this site's own domain (the reverse proxy
 *    sends /embed/ to the engine); assets/embed-same-origin.js reads #aw-oracle-root inside the frame directly.
 *  - cross-origin: <iframe src="<browser engine URL>/embed/<lang>/<tool>"> plus assets/embed.js (postMessage
 *    protocol v1), for a WordPress whose reverse proxy is not ours.
 * Each script gets its config once per page.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

use AwareWave\Oracle\Settings\Normalize;
use AwareWave\Oracle\Settings\Options;

final class Renderer {

	const SCRIPT_CROSS = 'aworacle-embed';
	const SCRIPT_SAME  = 'aworacle-embed-same-origin';
	/** Frame height before the content is measured, and the height kept when it cannot be measured. */
	const MIN_HEIGHT = 600;

	/** @var array<string,bool> */
	private static $configured = array();

	public static function render( string $tool ): string {
		$tool  = sanitize_key( $tool );
		$s     = Options::get();
		$same  = $s['embed'] !== Normalize::EMBED_CROSS_ORIGIN;
		$local = self::locale();
		$src   = $same ? EmbedUrl::path( $local, $tool ) : EmbedUrl::build( $s['browser_engine_url'], $local, $tool );
		if ( $src === '' ) {
			// Only people who can fix it see why nothing renders.
			return current_user_can( 'manage_options' )
				? '<p class="aworacle-error">' . esc_html__( 'AwareWave Oracle: use a valid tool name (and, for cross-origin embedding, set the engine URL in Settings → AwareWave Oracle).', 'aware-wave-oracle' ) . '</p>'
				: '';
		}
		$same ? self::enqueueSame( $s ) : self::enqueueCross( $s );
		/* translators: %s: tool name, e.g. ziwei */
		$title = sprintf( __( 'AwareWave Oracle: %s', 'aware-wave-oracle' ), $tool );
		return '<div class="aworacle-embed" data-aworacle-tool="' . esc_attr( $tool ) . '" data-aworacle-mode="' . esc_attr( $same ? Normalize::EMBED_SAME_ORIGIN : Normalize::EMBED_CROSS_ORIGIN ) . '">'
			. '<iframe src="' . esc_url( $src ) . '" title="' . esc_attr( $title ) . '" loading="lazy"'
			. ( $same ? '' : ' referrerpolicy="strict-origin-when-cross-origin"' )
			. ' style="width:100%;height:' . (int) self::MIN_HEIGHT . 'px;border:0;display:block"></iframe>'
			. '</div>';
	}

	public static function locale(): string {
		$s = Options::get();
		return LocaleMap::resolve( determine_locale(), $s['locale_map'], $s['default_locale'] );
	}

	/** @return array<string,string> tool slug => page URL */
	private static function pages( array $s ): array {
		$pages = array();
		foreach ( $s['page_map'] as $slug => $pageId ) {
			$url = get_permalink( (int) $pageId );
			if ( $url ) {
				$pages[ $slug ] = $url;
			}
		}
		return $pages;
	}

	/** @param array<string,mixed> $s */
	private static function enqueueSame( array $s ): void {
		wp_enqueue_script( self::SCRIPT_SAME, AWORACLE_URL . 'assets/embed-same-origin.js', array(), AWORACLE_VERSION, true );
		if ( ! empty( self::$configured[ self::SCRIPT_SAME ] ) ) {
			return;
		}
		self::$configured[ self::SCRIPT_SAME ] = true;
		$config = array(
			'rootId'    => EmbedUrl::ROOT_ID,
			'minHeight' => self::MIN_HEIGHT,
			'pages'     => (object) self::pages( $s ),
		);
		wp_add_inline_script( self::SCRIPT_SAME, 'window.AWORACLE_SAME=' . wp_json_encode( $config ) . ';', 'before' );
	}

	/** @param array<string,mixed> $s */
	private static function enqueueCross( array $s ): void {
		wp_enqueue_script( self::SCRIPT_CROSS, AWORACLE_URL . 'assets/embed.js', array(), AWORACLE_VERSION, true );
		if ( ! empty( self::$configured[ self::SCRIPT_CROSS ] ) ) {
			return;
		}
		self::$configured[ self::SCRIPT_CROSS ] = true;
		$config = array(
			'v'            => EmbedUrl::PROTOCOL_VERSION,
			'engineOrigin' => EmbedUrl::origin( $s['browser_engine_url'] ),
			'locale'       => self::locale(),
			'member'       => is_user_logged_in(),
			'loginUrl'     => wp_login_url( get_permalink() ?: home_url( '/' ) ),
			'pages'        => (object) self::pages( $s ),
		);
		wp_add_inline_script( self::SCRIPT_CROSS, 'window.AWORACLE=' . wp_json_encode( $config ) . ';', 'before' );
	}
}
