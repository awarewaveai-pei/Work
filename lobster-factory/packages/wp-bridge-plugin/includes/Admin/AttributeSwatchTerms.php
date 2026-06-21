<?php
/**
 * AttributeSwatchTerms — the STANDARD swatch config UX (how mature plugins like "Variation Swatches for
 * WooCommerce" do it): a colour picker on each GLOBAL product-attribute TERM (Products → Attributes →
 * Color → each term White/Black…), stored as term meta `awbridge_swatch_color`. Define a colour once on
 * the term and EVERY variable product using that attribute renders swatches — no per-product setup.
 *
 * This is the discoverable, reusable place (the previous per-product side box was non-standard). It
 * complements:
 *   - per-product `_awbridge_color_swatches` meta (the Printful one-click flow, which uses LOCAL/custom
 *     attributes that have no terms) — still wins per product;
 *   - the global SwatchPalette (fallback by colour NAME) — for local attributes / products without term meta.
 *
 * Swatches only swap the product image on click for a VARIABLE product whose colour terms are real
 * variations each carrying its own image — a Simple product has no variations and cannot do this.
 *
 * @package AwareWave\WpBridge\Admin
 */

namespace AwareWave\WpBridge\Admin;

final class AttributeSwatchTerms {

	/** Term meta key — read by Frontend\ColorSwatches when an option is a taxonomy term. */
	public const TERM_META = 'awbridge_swatch_color';

	public function register(): void {
		// Attribute taxonomies are registered on init; hook their term forms once that's available.
		add_action( 'admin_init', array( $this, 'hookTermForms' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/** Attach the colour field + save handler to every WooCommerce product-attribute taxonomy. */
	public function hookTermForms(): void {
		if ( ! function_exists( 'wc_get_attribute_taxonomies' ) || ! function_exists( 'wc_attribute_taxonomy_name' ) ) {
			return;
		}
		foreach ( wc_get_attribute_taxonomies() as $tax ) {
			$taxonomy = wc_attribute_taxonomy_name( $tax->attribute_name ); // e.g. "pa_color"
			if ( ! $taxonomy ) {
				continue;
			}
			add_action( "{$taxonomy}_add_form_fields", array( $this, 'addField' ) );
			add_action( "{$taxonomy}_edit_form_fields", array( $this, 'editField' ), 10, 2 );
			add_action( "created_{$taxonomy}", array( $this, 'save' ) );
			add_action( "edited_{$taxonomy}", array( $this, 'save' ) );
		}
	}

	/** Colour picker only on the attribute-term screens (edit-tags.php / term.php for a pa_* taxonomy). */
	public function enqueue( string $hook ): void {
		if ( $hook !== 'edit-tags.php' && $hook !== 'term.php' ) {
			return;
		}
		$taxonomy = isset( $_GET['taxonomy'] ) ? sanitize_key( wp_unslash( $_GET['taxonomy'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only screen gate
		if ( strpos( $taxonomy, 'pa_' ) !== 0 ) {
			return;
		}
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script( 'wp-color-picker' );
		wp_add_inline_script( 'wp-color-picker', 'jQuery(function($){$(".awb-term-color").wpColorPicker();});' );
	}

	/** "Add new term" screen — a blank colour field. */
	public function addField(): void {
		echo '<div class="form-field awb-term-color-field"><label for="awbridge_swatch_color">色塊顏色 (Swatch colour)</label>';
		echo '<input type="text" name="awbridge_swatch_color" id="awbridge_swatch_color" class="awb-term-color" value="" data-default-color="" />';
		echo '<p>商品頁這個顏色會顯示成<b>色塊</b>；變化型商品點色塊會換成該色變體圖。</p></div>';
	}

	/** "Edit term" screen — colour field pre-filled from the saved term meta. @param \WP_Term $term */
	public function editField( $term ): void {
		$val = esc_attr( (string) get_term_meta( $term->term_id, self::TERM_META, true ) );
		echo '<tr class="form-field awb-term-color-field"><th scope="row"><label for="awbridge_swatch_color">色塊顏色 (Swatch colour)</label></th>';
		echo '<td><input type="text" name="awbridge_swatch_color" id="awbridge_swatch_color" class="awb-term-color" value="' . $val . '" data-default-color="' . $val . '" />';
		echo '<p class="description">商品頁這個顏色會顯示成色塊（變化型商品點色塊換變體圖）。</p></td></tr>';
	}

	/**
	 * Persist the term colour. CSRF is covered by WooCommerce's own term-form nonce (this fires inside
	 * created_/edited_ which WP only triggers after verifying that nonce); we add an explicit capability
	 * check for defence-in-depth. @param int $termId
	 */
	public function save( $termId ): void {
		if ( ! isset( $_POST['awbridge_swatch_color'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- WC term form nonce already verified before created_/edited_ fire
			return;
		}
		if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_product_terms' ) ) {
			return;
		}
		$hex = $this->normalizeHex( (string) wp_unslash( $_POST['awbridge_swatch_color'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- see above
		if ( $hex !== '' ) {
			update_term_meta( (int) $termId, self::TERM_META, $hex );
		} else {
			delete_term_meta( (int) $termId, self::TERM_META );
		}
	}

	/** Validate + normalize to lowercase #rrggbb, or '' (shared semantics with Frontend\ColorSwatches). */
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
