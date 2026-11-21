<?php
/**
 * [aw_oracle tool="ziwei"] — embeds one engine tool.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

final class Shortcode {

	const TAG = 'aw_oracle';

	public function register(): void {
		add_shortcode( self::TAG, array( $this, 'render' ) );
	}

	/** @param array<string,string>|string $atts */
	public function render( $atts ): string {
		$atts = shortcode_atts( array( 'tool' => '' ), is_array( $atts ) ? $atts : array(), self::TAG );
		return Renderer::render( (string) $atts['tool'] );
	}
}
