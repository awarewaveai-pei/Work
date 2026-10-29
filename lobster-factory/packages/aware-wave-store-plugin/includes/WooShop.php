<?php
/**
 * Shop over WooCommerce + WooCommerce Subscriptions. Variations report their parent product id
 * (WC_Order_Item_Product::get_product_id), so plan meta lives on the parent product.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class WooShop implements Shop {

	const META_PLAN    = '_awarewave_plan_key';
	const META_UNITS   = '_awarewave_credit_units';
	const META_PRODUCT = '_awarewave_product_key';
	const META_GRANTED = '_awarewave_granted';

	public function order( int $orderId ): ?array {
		$order = wc_get_order( $orderId );
		if ( ! $order || ( function_exists( 'wcs_is_subscription' ) && wcs_is_subscription( $order ) ) ) {
			return null;
		}
		return array(
			'id'             => $orderId,
			'customer_id'    => (int) $order->get_customer_id(),
			'payment_method' => (string) $order->get_payment_method(),
			'total'          => (float) $order->get_total(),
			'total_refunded' => (float) $order->get_total_refunded(),
			'date_paid'      => $order->get_date_paid() ? (int) $order->get_date_paid()->getTimestamp() : 0,
			'lines'          => $this->lines( $order ),
		);
	}

	public function subscriptionIdsForOrder( int $orderId, array $types ): array {
		if ( ! function_exists( 'wcs_get_subscriptions_for_order' ) ) {
			return array();
		}
		return array_map( 'intval', array_keys( wcs_get_subscriptions_for_order( $orderId, array( 'order_type' => $types ) ) ) );
	}

	public function subscription( int $subscriptionId ): ?array {
		$sub = function_exists( 'wcs_get_subscription' ) ? wcs_get_subscription( $subscriptionId ) : null;
		if ( ! $sub ) {
			return null;
		}
		$next = (int) $sub->get_time( 'next_payment' );
		// A renewal hook can run before WCS stores the new next-payment date; compute it the way WCS will.
		if ( $next > 0 && $next <= time() && $sub->has_status( 'active' ) ) {
			$calc = $sub->calculate_date( 'next_payment' );
			$next = $calc ? (int) strtotime( $calc . ' +0000' ) : $next;
		}
		return array(
			'id'           => $subscriptionId,
			'customer_id'  => (int) $sub->get_customer_id(),
			'status'       => (string) $sub->get_status(),
			'payment_method' => (string) $sub->get_payment_method(),
			'next_payment' => $next,
			'end'          => (int) $sub->get_time( 'end' ),
			'lines'        => $this->lines( $sub ),
		);
	}

	public function productMeta( int $productId ): array {
		if ( $productId < 1 ) {
			return array( 'plan_key' => '', 'credit_units' => 0, 'product_key' => '' );
		}
		return array(
			'plan_key'     => (string) get_post_meta( $productId, self::META_PLAN, true ),
			'credit_units' => max( 0, (int) get_post_meta( $productId, self::META_UNITS, true ) ),
			'product_key'  => (string) get_post_meta( $productId, self::META_PRODUCT, true ),
		);
	}

	public function markGranted( int $orderId ): void {
		$order = wc_get_order( $orderId );
		if ( $order && $order->get_meta( self::META_GRANTED ) !== '1' ) {
			$order->update_meta_data( self::META_GRANTED, '1' );
			$order->save_meta_data();
		}
	}

	public function wasGranted( int $orderId ): bool {
		$order = wc_get_order( $orderId );
		return $order && $order->get_meta( self::META_GRANTED ) === '1';
	}

	public function addNote( int $orderOrSubscriptionId, string $note ): void {
		$order = $orderOrSubscriptionId > 0 ? wc_get_order( $orderOrSubscriptionId ) : null;
		if ( $order ) {
			$order->add_order_note( $note );
		} else {
			error_log( '[aware-wave-store] ' . $note ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
		}
	}

	/** @return list<array{product_id:int,qty:int}> */
	private function lines( $order ): array {
		$lines = array();
		foreach ( $order->get_items( 'line_item' ) as $item ) {
			$lines[] = array( 'product_id' => (int) $item->get_product_id(), 'qty' => (int) $item->get_quantity() );
		}
		return $lines;
	}
}
