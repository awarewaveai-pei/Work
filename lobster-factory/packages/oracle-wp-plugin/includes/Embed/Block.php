<?php
/**
 * Block "aware-wave/oracle": the editor picks a tool from the engine's list (visible buttons), the
 * front end renders server-side through the same Renderer as the shortcode. No build step: the editor
 * script uses the wp.* globals; its labels are translated here in PHP and passed in.
 *
 * @package AwareWave\Oracle\Embed
 */

namespace AwareWave\Oracle\Embed;

use AwareWave\Oracle\Engine\EngineClient;

final class Block {

	const NAME   = 'aware-wave/oracle';
	const EDITOR = 'aworacle-block-editor';

	public function register(): void {
		add_action( 'init', array( $this, 'registerBlock' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'editorData' ) );
	}

	public function registerBlock(): void {
		wp_register_script(
			self::EDITOR,
			AWORACLE_URL . 'assets/block.js',
			array( 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor' ),
			AWORACLE_VERSION,
			true
		);
		register_block_type(
			self::NAME,
			array(
				'api_version'     => 3,
				'title'           => __( 'AwareWave Oracle', 'aware-wave-oracle' ),
				'category'        => 'embed',
				'icon'            => 'star-filled',
				'editor_script'   => self::EDITOR,
				'attributes'      => array(
					'tool' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
				'render_callback' => function ( $attrs ) {
					return Renderer::render( is_array( $attrs ) ? (string) ( $attrs['tool'] ?? '' ) : '' );
				},
			)
		);
	}

	public function editorData(): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return;
		}
		$data = array(
			'tools'  => EngineClient::tools(),
			'labels' => array(
				'title'   => __( 'AwareWave Oracle', 'aware-wave-oracle' ),
				'pick'    => __( 'Choose a tool to embed:', 'aware-wave-oracle' ),
				'chosen'  => __( 'Embedded tool:', 'aware-wave-oracle' ),
				'none'    => __( 'No tools available — check Settings → AwareWave Oracle.', 'aware-wave-oracle' ),
				'preview' => __( 'The tool appears here on the published page.', 'aware-wave-oracle' ),
			),
		);
		wp_add_inline_script( self::EDITOR, 'window.AWORACLE_BLOCK=' . wp_json_encode( $data ) . ';', 'before' );
	}
}
