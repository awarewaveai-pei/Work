<?php
/**
 * ColorSwatchAdmin — the product-editor UI counterpart to Frontend\ColorSwatches. The storefront class
 * only RENDERS swatches from the `_awbridge_color_swatches` product meta; that meta is written
 * automatically by the one-click publish flow, but a human building a variable product by hand in
 * WooCommerce had no way to set it. This adds a "AwareWave 顏色色塊 (Color swatches)" meta box on the
 * product screen: one wp-color-picker per Colour-attribute option → saved into the same meta the
 * storefront reads. So a manually-built product gets swatches too.
 *
 * Scope: only meaningful for products that have a Colour attribute used for variations. If none exists
 * yet, the box explains how to add one (save the attribute first, then the colours appear here).
 *
 * @package AwareWave\WpBridge\Admin
 */

namespace AwareWave\WpBridge\Admin;

use AwareWave\WpBridge\Frontend\ColorSwatches;

final class ColorSwatchAdmin {

	private const NONCE = 'awbridge_swatch_nonce';

	public function register(): void {
		add_action( 'add_meta_boxes', array( $this, 'addBox' ) );
		add_action( 'woocommerce_process_product_meta', array( $this, 'save' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	public function addBox(): void {
		add_meta_box(
			'awbridge-color-swatches',
			'AwareWave 顏色色塊 (Color swatches)',
			array( $this, 'render' ),
			'product',
			'side',
			'default'
		);
	}

	/** Load WordPress's built-in colour picker on the product editor only. */
	public function enqueue( string $hook ): void {
		if ( $hook !== 'post.php' && $hook !== 'post-new.php' ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || $screen->post_type !== 'product' ) {
			return;
		}
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script( 'wp-color-picker' );
		wp_add_inline_script(
			'wp-color-picker',
			'jQuery(function($){$(".awbridge-hex").wpColorPicker();});'
		);
	}

	/** @param \WP_Post $post */
	public function render( $post ): void {
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $post->ID ) : null;
		$options = $product ? $this->colorOptions( $product ) : array();

		if ( $options === array() ) {
			echo '<p style="font-size:12px;color:#666;margin:0">先在「<b>商品資料 → 屬性</b>」新增一個名為 <b>Color</b> 的屬性、填顏色值（每行一個）、勾「<b>用於變化</b>」並<b>儲存</b>。儲存後這裡會列出每個顏色，讓你設定色塊 hex。</p>';
			return;
		}

		$map = $this->existingMap( (int) $post->ID );
		wp_nonce_field( self::NONCE, self::NONCE );
		echo '<p style="font-size:12px;color:#666;margin:0 0 8px">每個顏色填 hex；商品頁的 Color 會顯示成<b>色塊</b>，點色塊換成該色的變體圖。</p>';
		foreach ( $options as $opt ) {
			$val = isset( $map[ $opt ] ) ? $map[ $opt ] : '';
			printf(
				'<p style="margin:0 0 10px"><label style="display:block;font-weight:600;margin-bottom:3px">%1$s</label>'
				. '<input type="text" class="awbridge-hex" name="awbridge_swatch[%2$s]" value="%3$s" data-default-color="%3$s" placeholder="#rrggbb" /></p>',
				esc_html( $opt ),
				esc_attr( rawurlencode( $opt ) ), // name key — url-encoded so ']' / spaces survive PHP form parsing
				esc_attr( $val )
			);
		}
	}

	/** @param int $postId */
	public function save( $postId ): void {
		if ( ! isset( $_POST[ self::NONCE ] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE ) ) {
			return; // not our form / CSRF guard.
		}
		// edit_post on THIS product — WooCommerce maps it to edit_products for Shop Managers/Admins.
		if ( ! current_user_can( 'edit_post', $postId ) ) {
			return;
		}
		$raw = isset( $_POST['awbridge_swatch'] ) && is_array( $_POST['awbridge_swatch'] )
			? wp_unslash( $_POST['awbridge_swatch'] ) // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- each key+value sanitized below
			: null;
		if ( ! is_array( $raw ) ) {
			return; // box not submitted (e.g. product has no Colour attribute) — never touch the map.
		}
		$map = array();
		foreach ( array_slice( $raw, 0, 50, true ) as $label => $hex ) { // cap option count (typical < 30)
			$h = $this->normalizeHex( (string) $hex );
			if ( $h === '' ) {
				continue;
			}
			// render() rawurlencode()s the name key so an option label containing ']' survives PHP's
			// form-key parser; decode it back, then sanitize + length-cap before storing.
			$decoded = sanitize_text_field( rawurldecode( (string) $label ) );
			if ( $decoded !== '' ) {
				$map[ mb_substr( $decoded, 0, 200 ) ] = $h;
			}
		}
		// Write ONLY when at least one valid hex was provided. We deliberately do NOT delete on an
		// all-blank submit: if the rendered inputs were blank because the stored labels didn't match the
		// attribute options (casing/trim), a no-op save must not wipe a map the publish flow wrote.
		if ( $map !== array() ) {
			update_post_meta( $postId, ColorSwatches::META_KEY, wp_json_encode( $map, JSON_UNESCAPED_UNICODE ) );
		}
	}

	/**
	 * The Colour attribute's option labels for this product (local options or taxonomy term names).
	 * Name-based detection (the meta map may not exist yet on a fresh manual product).
	 *
	 * @param \WC_Product $product
	 * @return string[]
	 */
	private function colorOptions( $product ): array {
		if ( ! method_exists( $product, 'get_attributes' ) ) {
			return array();
		}
		foreach ( $product->get_attributes() as $attr ) {
			if ( ! is_object( $attr ) || ! method_exists( $attr, 'get_name' ) ) {
				continue;
			}
			$name = (string) $attr->get_name();
			if ( stripos( $name, 'color' ) === false && stripos( $name, 'colour' ) === false && strpos( $name, '顏色' ) === false ) {
				continue;
			}
			$opts = ( method_exists( $attr, 'is_taxonomy' ) && $attr->is_taxonomy() )
				? wc_get_product_terms( $product->get_id(), $name, array( 'fields' => 'names' ) )
				: $attr->get_options();
			$out = array();
			foreach ( (array) $opts as $o ) {
				$o = (string) $o;
				if ( $o !== '' ) {
					$out[] = $o;
				}
			}
			if ( $out !== array() ) {
				return $out;
			}
		}
		return array();
	}

	/** @return array<string,string> existing label=>hex from the stored meta (string JSON or array). */
	private function existingMap( int $postId ): array {
		$raw = get_post_meta( $postId, ColorSwatches::META_KEY, true );
		$decoded = is_string( $raw ) && $raw !== '' ? json_decode( $raw, true ) : ( is_array( $raw ) ? $raw : null );
		if ( ! is_array( $decoded ) ) {
			return array();
		}
		$map = array();
		foreach ( $decoded as $k => $v ) {
			if ( is_string( $k ) && is_string( $v ) ) {
				$map[ $k ] = $v;
			}
		}
		return $map;
	}

	/** Validate + normalize to lowercase #rrggbb, or '' (mirror of Frontend\ColorSwatches::normalizeHex). */
	private function normalizeHex( string $hex ): string {
		$hex = strtolower( trim( $hex ) );
		if ( $hex !== '' && $hex[0] !== '#' ) {
			$hex = '#' . $hex;
		}
		if ( preg_match( '/^#([0-9a-f])([0-9a-f])([0-9a-f])$/', $hex, $m ) ) {
			$hex = '#' . $m[1] . $m[1] . $m[2] . $m[2] . $m[3] . $m[3];
		}
		return preg_match( '/^#[0-9a-f]{6}$/', $hex ) ? $hex : '';
	}
}
