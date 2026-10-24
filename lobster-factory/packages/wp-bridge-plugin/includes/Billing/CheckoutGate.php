<?php
/**
 * Checkout gate (ADR 017 4b-2): a cart holding an AwareWave plan or credit pack checks out only for a signed-in
 * member whose email is verified. next-admin refuses a first payment without email_verified (400
 * email_unverified, no account), so letting it through would take money for an account that never opens.
 * Other shop products (POD etc.) are not gated.
 *
 * @package AwareWave\WpBridge\Billing
 */

namespace AwareWave\WpBridge\Billing;

final class CheckoutGate {

	/** @return string|null null = may check out; else login_required | email_unverified */
	public static function refusal( bool $loggedIn, bool $emailVerified, bool $cartHasAwareWave ): ?string {
		if ( ! $cartHasAwareWave ) {
			return null;
		}
		if ( ! $loggedIn ) {
			return 'login_required';
		}
		if ( ! $emailVerified ) {
			return 'email_unverified';
		}
		return null;
	}

	/** A line is AwareWave billing when its product names a plan or carries credit units. */
	public static function isBillingProduct( array $meta ): bool {
		return ( $meta['plan_key'] ?? '' ) !== '' || (int) ( $meta['credit_units'] ?? 0 ) > 0;
	}

	// ---- WordPress wiring ----

	/** @var Shop */
	private $shop;

	public function __construct( Shop $shop ) {
		$this->shop = $shop;
	}

	public function register(): void {
		add_action( 'woocommerce_checkout_process', array( $this, 'classicCheckout' ) );
		// Block checkout (Store API) skips woocommerce_checkout_process; a RouteException here aborts the order.
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( $this, 'blockCheckout' ), 10, 0 );
		// Pay-for-order page (retrying a failed order) runs neither hook above; an error notice stops the payment.
		add_action( 'woocommerce_before_pay_action', array( $this, 'payForOrder' ) );
	}

	/** @param \WC_Order $order */
	public function payForOrder( $order ): void {
		$hasBilling = false;
		foreach ( $order->get_items( 'line_item' ) as $item ) {
			if ( self::isBillingProduct( $this->shop->productMeta( (int) $item->get_product_id() ) ) ) {
				$hasBilling = true;
				break;
			}
		}
		$uid  = get_current_user_id();
		$code = self::refusal( $uid > 0, $uid > 0 && EmailVerification::isUserVerified( $uid ), $hasBilling );
		if ( $code !== null ) {
			wc_add_notice( self::message( $code ), 'error' );
		}
	}

	public function classicCheckout(): void {
		$code = $this->currentRefusal();
		if ( $code !== null ) {
			wc_add_notice( self::message( $code ), 'error' );
		}
	}

	public function blockCheckout(): void {
		$code = $this->currentRefusal();
		if ( $code !== null && class_exists( '\Automattic\WooCommerce\StoreApi\Exceptions\RouteException' ) ) {
			throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException( 'awbridge_' . $code, wp_strip_all_tags( self::message( $code ) ), 400 );
		}
	}

	private function currentRefusal(): ?string {
		$hasBilling = false;
		if ( function_exists( 'WC' ) && WC()->cart ) {
			foreach ( WC()->cart->get_cart() as $line ) {
				if ( self::isBillingProduct( $this->shop->productMeta( (int) ( $line['product_id'] ?? 0 ) ) ) ) {
					$hasBilling = true;
					break;
				}
			}
		}
		$uid = get_current_user_id();
		return self::refusal( $uid > 0, $uid > 0 && EmailVerification::isUserVerified( $uid ), $hasBilling );
	}

	private static function message( string $code ): string {
		if ( $code === 'login_required' ) {
			return '購買 AwareWave 訂閱或點數前，請先登入或註冊會員。';
		}
		return '請先到信箱按確認連結，完成帳號設定後再結帳。 <a href="' . esc_url( EmailVerification::resendUrl() ) . '">重寄確認信</a>';
	}
}
