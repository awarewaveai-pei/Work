<?php
/**
 * ColorSwatches — render a variable product's Colour attribute as clickable hex SWATCHES on the
 * single-product page (instead of the default WooCommerce dropdown), and let a swatch click drive
 * WooCommerce's native variation-image swap (the per-colour mockup set on each variation by the
 * publish flow). Drop-in: install this plugin on any client's WooCommerce and POD products built by
 * the publish flow show colour swatches automatically — no theme dependency, no third-party plugin.
 *
 * Why this is DATA-DRIVEN, not name-guessing: the publish flow writes a product meta
 * `_awbridge_color_swatches` = JSON map { "<attribute option label>": "#rrggbb", ... } (set in
 * pod-product.ts via meta_data). We render swatches for an attribute ONLY when the product carries
 * that map AND the attribute's options are keys in it. A product without the map (or a non-colour
 * attribute) is left as the normal dropdown. So this can never mis-skin an unrelated attribute.
 *
 * Image swap is WooCommerce-NATIVE: each variation already has its colour mockup as its image
 * (WC_Product_Variation::set_image_id, set by ProductCreator). WC's wc-add-to-cart-variation.js swaps
 * the gallery main image when a variation is matched. The swatch only sets the hidden <select> value
 * and fires jQuery 'change' — WC does the rest (image + price + add-to-cart enable).
 *
 * WP/Woo functions are called unqualified (PHP global-namespace fallback for functions); we touch no
 * WC classes here, only the dropdown HTML + post meta, so the file loads on a non-Woo site too (the
 * filter simply never fires).
 *
 * @package AwareWave\WpBridge\Frontend
 */

namespace AwareWave\WpBridge\Frontend;

final class ColorSwatches {

	/** Product meta key holding the JSON { optionLabel: "#rrggbb" } map. */
	public const META_KEY = '_awbridge_color_swatches';

	/** Guard so the inline CSS/JS is printed at most once per request. */
	private bool $assetsPrinted = false;

	public function register(): void {
		// Front-end only. The dashboard product editor renders attributes its own way; skinning there
		// would fight the admin UI, so we bind the filter only on the storefront.
		add_action(
			'wp',
			function () {
				if ( function_exists( 'is_admin' ) && is_admin() ) {
					return;
				}
				add_filter( 'woocommerce_dropdown_variation_attribute_options_html', array( $this, 'renderSwatches' ), 20, 2 );
			}
		);
	}

	/**
	 * Decorate the Colour attribute's dropdown with swatches. Returns the original $html untouched for
	 * any attribute we can't confidently map to colours (no meta map, or options not in the map).
	 *
	 * @param string              $html WooCommerce's rendered <select> for this attribute.
	 * @param array<string,mixed> $args { options:string[], attribute:string, product:\WC_Product, name:string, id:string, ... }
	 * @return string
	 */
	public function renderSwatches( string $html, array $args ): string {
		// Single-product storefront page only — this dropdown filter can also fire on shop/category pages
		// (related products / quick-view), so skip them to avoid a wasted meta read per attribute there.
		// (Admin is already excluded at registration.)
		if ( function_exists( 'is_singular' ) && ! is_singular( 'product' ) ) {
			return $html;
		}
		$product = $args['product'] ?? null;
		$options = ( isset( $args['options'] ) && is_array( $args['options'] ) ) ? $args['options'] : array();
		if ( ! $product || ! is_object( $product ) || ! method_exists( $product, 'get_id' ) || $options === array() ) {
			return $html;
		}

		$attribute  = isset( $args['attribute'] ) ? (string) $args['attribute'] : '';
		$isTaxonomy = $attribute !== '' && taxonomy_exists( $attribute );

		// Colour sources, in precedence: a taxonomy term's OWN swatch colour (THE STANDARD place — set on
		// Products → Attributes → <Color> → term) > this product's per-product map (Printful one-click /
		// per-product box) > the global palette (by colour name). Render swatches only when EVERY option
		// resolves to a colour; a partial match means this isn't the colour attribute → leave the dropdown.
		$perProduct = $this->productMap( (int) $product->get_id() );
		$palette    = \AwareWave\WpBridge\Admin\SwatchPalette::palette();

		$swatches = array();
		foreach ( $options as $option ) {
			$value = (string) $option; // what WC's <select> expects: term slug (taxonomy) or label (local)
			$label = $value;           // human label for title/aria-label (term NAME for taxonomy)
			$hex   = '';
			if ( $isTaxonomy ) {
				$term = get_term_by( 'slug', $value, $attribute );
				if ( $term && ! is_wp_error( $term ) ) {
					$label = $term->name;
					$hex   = $this->normalizeHex( (string) get_term_meta( $term->term_id, \AwareWave\WpBridge\Admin\AttributeSwatchTerms::TERM_META, true ) );
					if ( $hex === '' ) {
						$hex = $this->normalizeHex( $perProduct[ $term->name ] ?? ( $palette[ $term->name ] ?? '' ) );
					}
				}
			} else {
				$hex = $this->normalizeHex( $perProduct[ $value ] ?? ( $palette[ $value ] ?? '' ) );
			}
			if ( $hex === '' ) {
				return $html; // an option without a colour -> not safely a colour attribute; bail.
			}
			$swatches[] = array( 'value' => $value, 'label' => $label, 'hex' => $hex );
		}

		// WC computes the <select> id/name from the attribute when its own id/name args are empty, yet
		// passes the ORIGINAL (empty) args to this filter — mirror that derivation so the JS binds the
		// right <select> by id/name rather than DOM adjacency.
		$selectId   = ( isset( $args['id'] ) && (string) $args['id'] !== '' ) ? (string) $args['id'] : sanitize_title( $attribute );
		$selectName = ( isset( $args['name'] ) && (string) $args['name'] !== '' )
			? (string) $args['name']
			: ( $attribute !== '' ? 'attribute_' . sanitize_title( $attribute ) : '' );
		$this->printAssetsOnce();

		// Swatches first (the visible control), then the original <select> kept for WC's JS — JS hides it.
		// data-awbridge-name lets the JS bind to the right <select> by name within this product's form
		// (robust when more than one variation form is on a page).
		$out  = '<div class="awbridge-swatches" role="radiogroup" data-awbridge-select="' . esc_attr( $selectId )
			. '" data-awbridge-name="' . esc_attr( $selectName ) . '">';
		foreach ( $swatches as $s ) {
			$out .= sprintf(
				'<button type="button" class="awbridge-swatch" role="radio" aria-checked="false"'
				. ' data-value="%1$s" title="%2$s" aria-label="%2$s"><span style="background:%3$s"></span></button>',
				esc_attr( $s['value'] ), // data-value = slug (taxonomy) / label (local) — what the <select> submits
				esc_attr( $s['label'] ), // title + aria-label = human display name
				esc_attr( $s['hex'] )
			);
		}
		$out .= '</div>';

		return $out . $html;
	}

	/**
	 * Read + decode the product's colour→hex map. Accepts either the raw JSON string we write, or an
	 * already-decoded array (defensive — some meta layers auto-unserialize). Returns label=>hex pairs.
	 *
	 * @return array<string,string>
	 */
	/**
	 * This product's per-product colour map (`_awbridge_color_swatches` — the Printful one-click flow or
	 * the per-product box). label=>hex; empty when none set. The palette + term colours are layered on
	 * per-option in renderSwatches, so this returns ONLY the per-product source.
	 *
	 * @return array<string,string>
	 */
	private function productMap( int $productId ): array {
		$raw     = get_post_meta( $productId, self::META_KEY, true );
		$decoded = is_string( $raw ) && $raw !== '' ? json_decode( $raw, true ) : ( is_array( $raw ) ? $raw : null );
		if ( ! is_array( $decoded ) ) {
			return array();
		}
		$map = array();
		foreach ( $decoded as $label => $hex ) {
			if ( is_string( $label ) && is_string( $hex ) ) {
				$map[ $label ] = $hex;
			}
		}
		return $map;
	}

	/** Validate + normalize a hex colour to lowercase #rrggbb, or '' if malformed (never trust meta blindly). */
	private function normalizeHex( string $hex ): string {
		$hex = strtolower( trim( $hex ) );
		if ( $hex !== '' && $hex[0] !== '#' ) {
			$hex = '#' . $hex;
		}
		// Expand #rgb -> #rrggbb so CSS + the swatch border heuristic are consistent.
		if ( preg_match( '/^#([0-9a-f])([0-9a-f])([0-9a-f])$/', $hex, $m ) ) {
			$hex = '#' . $m[1] . $m[1] . $m[2] . $m[2] . $m[3] . $m[3];
		}
		return preg_match( '/^#[0-9a-f]{6}$/', $hex ) ? $hex : '';
	}

	/**
	 * Print the swatch CSS + JS once, inline (self-contained: no enqueued asset files to ship). The JS
	 * wires each swatch group to its hidden <select> and uses jQuery 'change' so WooCommerce's
	 * variation script (which binds via jQuery) performs the native image/price swap.
	 */
	private function printAssetsOnce(): void {
		if ( $this->assetsPrinted ) {
			return;
		}
		$this->assetsPrinted = true;
		add_action( 'wp_footer', array( $this, 'printAssets' ), 99 );
	}

	public function printAssets(): void {
		// CSS inline (style-src CSP is rarely enforced, and a blocked style only loses visual polish, not
		// behaviour). The JS goes through wp_print_inline_script_tag() so WordPress attaches any CSP script
		// nonce — otherwise a strict-CSP storefront would silently block the swatch behaviour entirely.
		echo '<style id="awbridge-swatches-css">'
			. '.awbridge-swatches{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}'
			. '.awbridge-swatch{width:34px;height:34px;padding:3px;border:1px solid rgba(0,0,0,.15);border-radius:50%;background:#fff;cursor:pointer;line-height:0;transition:box-shadow .12s,border-color .12s}'
			. '.awbridge-swatch span{display:block;width:100%;height:100%;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}'
			. '.awbridge-swatch:hover{border-color:rgba(0,0,0,.45)}'
			. '.awbridge-swatch[aria-checked="true"]{border-color:#111;box-shadow:0 0 0 2px #111}'
			. '.awbridge-swatches+select.awbridge-hidden-select{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;padding:0;margin:-1px}'
			. '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput -- static literal CSS, no dynamic data

		$js = <<<'JS'
(function(){
  function jq(){ return window.jQuery; }
  function selectFor(group){
    // Prefer the matching <select> WITHIN this product's variation form (robust when more than one
    // variation form is on a page — related products / quick-view). Then fall back to id, then sibling.
    var name = group.getAttribute('data-awbridge-name');
    var form = group.closest('form.variations_form') || group.closest('form');
    if(name && form){ var esc=(window.CSS&&CSS.escape)?CSS.escape(name):String(name).replace(/[^\w-]/g,'\\$&'); var byName = form.querySelector('select[name="'+esc+'"]'); if(byName){ return byName; } }
    var id = group.getAttribute('data-awbridge-select');
    var byId = id ? document.getElementById(id) : null;
    if(byId && byId.tagName==='SELECT'){ return byId; }
    var n = group.nextElementSibling;
    while(n && n.tagName!=='SELECT'){ n = n.nextElementSibling; }
    return (n && n.tagName==='SELECT') ? n : null;
  }
  function syncActive(group, sel){
    var v = sel.value;
    group.querySelectorAll('.awbridge-swatch').forEach(function(b){
      b.setAttribute('aria-checked', b.getAttribute('data-value') === v ? 'true' : 'false');
    });
  }
  function wire(group){
    if(group.__awb){ return; } group.__awb = true;
    var sel = selectFor(group);
    if(!sel){ return; }
    sel.classList.add('awbridge-hidden-select');
    group.addEventListener('click', function(e){
      var btn = e.target.closest('.awbridge-swatch'); if(!btn){ return; }
      e.preventDefault();
      var val = btn.getAttribute('data-value');
      var $ = jq();
      if($){ $(sel).val(val).trigger('change'); } else { sel.value = val; sel.dispatchEvent(new Event('change',{bubbles:true})); }
      syncActive(group, sel);
    });
    sel.addEventListener('change', function(){ syncActive(group, sel); });
    var $ = jq();
    if($){ $(document).on('reset_data', function(){ setTimeout(function(){ syncActive(group, sel); }, 0); }); }
    syncActive(group, sel);
  }
  function init(){ document.querySelectorAll('.awbridge-swatches').forEach(wire); }
  if(document.readyState !== 'loading'){ init(); } else { document.addEventListener('DOMContentLoaded', init); }
  if(jq()){ jq()(function(){ jq()('.variations_form').on('wc_variation_form', init); }); }
})();
JS;

		if ( function_exists( 'wp_print_inline_script_tag' ) ) {
			wp_print_inline_script_tag( $js, array( 'id' => 'awbridge-swatches-js' ) );
		} else {
			echo '<script id="awbridge-swatches-js">' . $js . '</script>'; // phpcs:ignore -- pre-WP-5.7 fallback; plugin requires 6.0
		}
	}
}
