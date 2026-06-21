<?php
/**
 * SwatchPalette — a provider-agnostic master colour list the operator manages by hand (add / remove).
 * This is the SSOT for the colours of products the operator builds OUTSIDE the Printful one-click flow
 * (other print providers / self-print). It is intentionally NOT tied to Printful: the Printful 3-model
 * POD flow keeps its own Printful-bound colours (pod-catalog-config / one-click) and is untouched.
 *
 * How it's used:
 *   - Storefront Frontend\ColorSwatches falls back to this palette when a product has no per-product
 *     `_awbridge_color_swatches` meta: any Colour-attribute option whose label matches a palette entry
 *     renders as that colour's swatch. So a hand-built product gets swatches with ZERO per-product setup
 *     as long as its Colour values use the palette's names.
 *   - The per-product meta box (Admin\ColorSwatchAdmin) pre-fills each option's hex from the palette
 *     (override still possible per product).
 *
 * Storage: a single wp_option holding a JSON { label: "#rrggbb" } map. Managed at
 * Products → 🎨 色票調色盤 (manage_woocommerce).
 *
 * @package AwareWave\WpBridge\Admin
 */

namespace AwareWave\WpBridge\Admin;

final class SwatchPalette {

	public const OPTION = 'awbridge_swatch_palette';
	private const CAP    = 'manage_woocommerce';
	private const NONCE  = 'awbridge_palette_save';
	private const SLUG   = 'awbridge-swatch-palette';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	public function menu(): void {
		add_submenu_page(
			'edit.php?post_type=product',
			'AwareWave 色票調色盤',
			'🎨 色票調色盤',
			self::CAP,
			self::SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * The saved palette as a validated { label => #rrggbb } map. Static so the storefront + the
	 * per-product box read the same source. Returns [] when nothing is configured.
	 *
	 * @return array<string,string>
	 */
	public static function palette(): array {
		$raw     = get_option( self::OPTION, '' );
		$decoded = is_string( $raw ) && $raw !== '' ? json_decode( $raw, true ) : ( is_array( $raw ) ? $raw : null );
		if ( ! is_array( $decoded ) ) {
			return array();
		}
		$map = array();
		foreach ( $decoded as $label => $hex ) {
			if ( is_string( $label ) && is_string( $hex ) ) {
				$h = self::normalizeHex( $hex );
				if ( $h !== '' ) {
					$map[ $label ] = $h;
				}
			}
		}
		return $map;
	}

	/** Sensible starting rows on first visit (the operator's already-decided colours). Not saved until she Saves. */
	private static function seedDefaults(): array {
		return array(
			'白 White'            => '#ffffff',
			'運動灰 Sport Grey'   => '#9b969c',
			'黑 Black'            => '#080808',
			'森林綠 Forest Green' => '#213b21',
			'麻灰 Heather Grey'   => '#cfcbc8',
			'海軍藍 French Navy'  => '#112537',
			'海軍藍 Navy'         => '#1a2330',
		);
	}

	public function enqueue( string $hook ): void {
		if ( substr( $hook, -strlen( self::SLUG ) ) !== self::SLUG ) {
			return; // exact suffix match (hook is e.g. "product_page_awbridge-swatch-palette").
		}
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script( 'wp-color-picker' );
	}

	public function render(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Insufficient permissions.' );
		}

		$saved = false;
		if ( isset( $_POST[ self::NONCE ] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST[ self::NONCE ] ) ), self::NONCE ) ) {
			$this->save();
			$saved = true;
		}

		$map = self::palette();
		$isSeed = false;
		if ( $map === array() && ! $saved ) {
			$map    = self::seedDefaults(); // show a starting set the first time (unsaved until Save).
			$isSeed = true;
		}

		echo '<div class="wrap"><h1>🎨 AwareWave 色票調色盤 (Color swatches palette)</h1>';
		echo '<p style="max-width:760px">這是你<b>自建商品</b>（非 Printful 一鍵）共用的色票。商品的 <b>Color</b> 屬性值只要用這裡的名稱，前台就會自動顯示對應色塊 —— 不用每個商品手動設。<br><b>Printful 那 3 款</b>走一鍵、用 Printful 綁定色，跟這裡無關、不受影響。</p>';
		if ( $saved ) {
			echo '<div class="notice notice-success"><p>色票已儲存。</p></div>';
		} elseif ( $isSeed ) {
			echo '<div class="notice notice-info"><p>以下是建議起始色（你那 3 款的顏色）。<b>按下方「儲存色票」才會生效</b>；你可自由增加 / 刪除。</p></div>';
		}

		echo '<form method="post">';
		wp_nonce_field( self::NONCE, self::NONCE );
		echo '<table class="widefat striped" style="max-width:640px" id="awb-pal-rows"><thead><tr><th style="width:55%">顏色名稱 (對應 Color 屬性值)</th><th>色塊顏色</th><th style="width:60px"></th></tr></thead><tbody>';
		foreach ( $map as $label => $hex ) {
			$this->rowHtml( (string) $label, (string) $hex );
		}
		echo '</tbody></table>';

		// Hidden template row cloned by JS for "add colour".
		echo '<table style="display:none"><tbody><tr id="awb-pal-template" class="awb-pal-row">';
		echo '<td><input type="text" name="palette_label[]" value="" class="regular-text" placeholder="例：芥末黃 Mustard" /></td>';
		echo '<td><input type="text" name="palette_hex[]" value="" class="awb-pal-hex" data-default-color="" /></td>';
		echo '<td><button class="button-link-delete awb-pal-remove" type="button">移除</button></td>';
		echo '</tr></tbody></table>';

		echo '<p><button type="button" class="button" id="awb-pal-add">＋ 新增顏色</button></p>';
		submit_button( '儲存色票' );
		echo '</form></div>';

		$this->printJs();
	}

	private function rowHtml( string $label, string $hex ): void {
		printf(
			'<tr class="awb-pal-row"><td><input type="text" name="palette_label[]" value="%1$s" class="regular-text" /></td>'
			. '<td><input type="text" name="palette_hex[]" value="%2$s" class="awb-pal-hex" data-default-color="%2$s" /></td>'
			. '<td><button class="button-link-delete awb-pal-remove" type="button">移除</button></td></tr>',
			esc_attr( $label ),
			esc_attr( $hex )
		);
	}

	private function save(): void {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$labels = isset( $_POST['palette_label'] ) && is_array( $_POST['palette_label'] ) ? wp_unslash( $_POST['palette_label'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- sanitized per element below
		$hexes  = isset( $_POST['palette_hex'] ) && is_array( $_POST['palette_hex'] ) ? wp_unslash( $_POST['palette_hex'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- sanitized per element below
		$n      = min( count( $labels ), count( $hexes ), 100 );
		$map    = array();
		for ( $i = 0; $i < $n; $i++ ) {
			$label = mb_substr( sanitize_text_field( (string) $labels[ $i ] ), 0, 200 );
			$h     = self::normalizeHex( (string) $hexes[ $i ] );
			if ( $label !== '' && $h !== '' ) {
				$map[ $label ] = $h;
			}
		}
		$json = wp_json_encode( $map, JSON_UNESCAPED_UNICODE );
		if ( $json !== false ) {
			update_option( self::OPTION, $json ); // skip write on the rare encode failure rather than store `false`.
		}
	}

	private function printJs(): void {
		$js = <<<'JS'
jQuery(function($){
  function pick($scope){ $scope.find('.awb-pal-hex').each(function(){ if(!$(this).closest('.wp-picker-container').length){ $(this).wpColorPicker(); } }); }
  pick($('#awb-pal-rows'));
  $('#awb-pal-add').on('click', function(e){
    e.preventDefault();
    var $row = $('#awb-pal-template').clone().removeAttr('id');
    $('#awb-pal-rows tbody').append($row);
    pick($row);
    $row.find('input[name="palette_label[]"]').focus();
  });
  $('#awb-pal-rows').on('click', '.awb-pal-remove', function(e){
    e.preventDefault();
    var $r = $(this).closest('tr');
    // remove the wp-color-picker wrapper too, then the row
    $r.remove();
  });
});
JS;
		if ( function_exists( 'wp_print_inline_script_tag' ) ) {
			wp_print_inline_script_tag( $js, array( 'id' => 'awb-pal-js' ) );
		} else {
			echo '<script id="awb-pal-js">' . $js . '</script>'; // phpcs:ignore
		}
	}

	/** Validate + normalize to lowercase #rrggbb, or '' (shared semantics with Frontend\ColorSwatches). */
	private static function normalizeHex( string $hex ): string {
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
