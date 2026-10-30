<?php
/**
 * Product edit screen fields (General tab): the ONLY product → plan mapping next-admin sees.
 * _awarewave_plan_key (subscriptions and packs), _awarewave_credit_units (packs), _awarewave_product_key (which
 * door the My Account 「進入」 button opens). An invalid value is refused with an admin error, not saved.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class ProductFields {

	const PRODUCT_KEY = '/^[a-z0-9][a-z0-9_-]{0,63}$/';

	public function register(): void {
		add_action( 'woocommerce_product_options_general_product_data', array( $this, 'render' ) );
		add_action( 'woocommerce_admin_process_product_object', array( $this, 'save' ) );
	}

	public function render(): void {
		echo '<div class="options_group">';
		woocommerce_wp_text_input(
			array(
				'id'          => WooShop::META_PLAN,
				'label'       => 'AwareWave 方案代碼',
				'desc_tip'    => true,
				'description' => '訂閱商品填一個；點數包可填多個（空白隔開，一個方案開一個產品，例：studio_credits tarot_credits）。小寫英數與 _ . -，與 app.aware-wave.com /ops/plans 的方案代碼相同。留空＝不是 AwareWave 商品。',
			)
		);
		woocommerce_wp_text_input(
			array(
				'id'                => WooShop::META_UNITS,
				'label'             => 'AwareWave 點數（每件）',
				'type'              => 'number',
				'custom_attributes' => array( 'min' => '1', 'max' => (string) PaymentEvents::MAX_UNITS, 'step' => '1' ),
				'desc_tip'          => true,
				'description'       => '只有點數包填。訂閱商品留空。',
			)
		);
		woocommerce_wp_text_input(
			array(
				'id'          => WooShop::META_PRODUCT,
				'label'       => 'AwareWave 產品（我的帳號「進入」按鈕）',
				'desc_tip'    => true,
				'description' => '例如 tarot；留空＝不顯示進入按鈕。',
			)
		);
		echo '</div>';
	}

	/** @param \WC_Product $product */
	public function save( $product ): void {
		$plan  = strtolower( trim( sanitize_text_field( wp_unslash( $_POST[ WooShop::META_PLAN ] ?? '' ) ) ) );
		$units = trim( sanitize_text_field( wp_unslash( $_POST[ WooShop::META_UNITS ] ?? '' ) ) );
		$door  = strtolower( trim( sanitize_text_field( wp_unslash( $_POST[ WooShop::META_PRODUCT ] ?? '' ) ) ) );

		$plans  = PaymentEvents::packPlanKeys( $plan );
		$isPack = ctype_digit( $units ) && (int) $units >= 1 && (int) $units <= PaymentEvents::MAX_UNITS;
		if ( $plan === '' || ( count( $plans ) === 1 && preg_match( PaymentEvents::KEY, $plan ) ) || ( $plans && $isPack ) ) {
			$product->update_meta_data( WooShop::META_PLAN, implode( ' ', $plans ) );
		} else {
			$this->error( 'AwareWave 方案代碼格式不符（訂閱商品只能填一個；多個只限點數包，空白隔開、不可重複、最多 ' . PaymentEvents::MAX_PACK_PLANS . ' 個），未儲存。' );
		}
		if ( $units === '' ) {
			$product->delete_meta_data( WooShop::META_UNITS );
		} elseif ( $isPack ) {
			$product->update_meta_data( WooShop::META_UNITS, (string) (int) $units );
		} else {
			$this->error( 'AwareWave 點數須為 1 到 ' . PaymentEvents::MAX_UNITS . ' 的整數，未儲存。' );
		}
		if ( $door === '' || preg_match( self::PRODUCT_KEY, $door ) ) {
			$product->update_meta_data( WooShop::META_PRODUCT, $door );
		} else {
			$this->error( 'AwareWave 產品代碼格式不符，未儲存。' );
		}
	}

	private function error( string $message ): void {
		if ( class_exists( '\WC_Admin_Meta_Boxes' ) ) {
			\WC_Admin_Meta_Boxes::add_error( $message );
		}
	}
}
