<?php
/**
 * What PaymentEvents reads from WooCommerce / WooCommerce Subscriptions, as plain arrays, so the mapping is
 * unit-tested without WordPress. Production: WooShop.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

interface Shop {

	/** date_paid: unix seconds WooCommerce recorded the payment, 0 = not recorded. A line's total = what was paid for it after discounts (tax excluded). @return array{id:int,customer_id:int,payment_method:string,total:float,total_refunded:float,date_paid:int,lines:list<array{product_id:int,qty:int,total?:float}>}|null */
	public function order( int $orderId ): ?array;

	/**
	 * Subscription ids related to an order. $types: WCS relation types ('parent', 'renewal', 'switch').
	 *
	 * @param list<string> $types
	 * @return list<int>
	 */
	public function subscriptionIdsForOrder( int $orderId, array $types ): array;

	/** next_payment / end: unix seconds, 0 = none; status without the wc- prefix. @return array{id:int,customer_id:int,status:string,payment_method:string,next_payment:int,end:int,lines:list<array{product_id:int,qty:int,total?:float}>}|null */
	public function subscription( int $subscriptionId ): ?array;

	/** @return array{plan_key:string,credit_units:int,product_key:string} */
	public function productMeta( int $productId ): array;

	/** Marks an order whose payment was turned into rights (order meta), so a later full refund takes them back. */
	public function markGranted( int $orderId ): void;

	public function wasGranted( int $orderId ): bool;

	/** Orders and subscriptions both take notes (a WCS subscription is an order type). */
	public function addNote( int $orderOrSubscriptionId, string $note ): void;
}
