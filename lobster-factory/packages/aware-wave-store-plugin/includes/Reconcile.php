<?php
/**
 * Daily reconciliation (ADR 017 4b): the paid AwareWave orders of a time window, as next-admin's
 * lib/payments/woo-reconcile.ts compares them with the payment events it received. Read-only; no member data leaves
 * (order ids, times, payment method ids, subscription ids). The request is signed with the payment secret under its
 * own label, so a reconcile signature is never a valid payment-event signature.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class Reconcile {

	const ROUTE_NS      = 'aware-wave-store/v1';
	const ROUTE         = '/reconcile';
	const TS_HEADER     = 'X-AwareWave-Reconcile-Timestamp';
	const SIG_HEADER    = 'X-AwareWave-Reconcile-Signature';
	const MAX_SKEW_SEC  = 300;
	const MAX_WINDOW    = 31 * 86400;

	/** @var Shop */
	private $shop;
	/** @var list<string> */
	private $allowedGateways;

	/** @param list<string> $allowedGateways */
	public function __construct( Shop $shop, array $allowedGateways ) {
		$this->shop            = $shop;
		$this->allowedGateways = $allowedGateways;
	}

	public static function signature( string $secret, int $from, int $to, int $ts ): string {
		return base64_encode( hash_hmac( 'sha256', "awarewave-reconcile-v1\n{$from}\n{$to}\n{$ts}", $secret, true ) );
	}

	/** A signed, fresh request for a window no longer than MAX_WINDOW. */
	public static function verify( string $secret, int $from, int $to, int $ts, string $signature, int $now ): bool {
		if ( $secret === '' || $from < 0 || $to <= $from || $to - $from > self::MAX_WINDOW || abs( $now - $ts ) > self::MAX_SKEW_SEC ) {
			return false;
		}
		return hash_equals( self::signature( $secret, $from, $to, $ts ), $signature );
	}

	/** The plans a subscription's lines carry, the rule PaymentEvents::planKeys sends one event for each. @return list<string> */
	private function plans( int $subscriptionId ): array {
		$sub  = $this->shop->subscription( $subscriptionId );
		$keys = array();
		foreach ( $sub ? $sub['lines'] : array() as $line ) {
			$meta = $this->shop->productMeta( (int) $line['product_id'] );
			if ( $meta['credit_units'] === 0 && preg_match( PaymentEvents::KEY, $meta['plan_key'] ) ) {
				$keys[ $meta['plan_key'] ] = true;
			}
		}
		return array_keys( $keys );
	}

	/**
	 * The orders among $orderIds that hold AwareWave lines or started/renewed a subscription with AwareWave plans.
	 * auto = the plugin sends it by itself: it already did (granted marker, whatever the list says today), or it would
	 * now (a member's order paid by a method on the list, or the sign-up gift). refunded = fully refunded since.
	 *
	 * @param list<int> $orderIds
	 * @param list<int> $refundedIds
	 * @return list<array{id:int,date_paid:int,payment_method:string,credit:bool,subscriptions:list<array{id:int,plans:list<string>}>,auto:bool,granted:bool,refunded:bool,reason?:string}>
	 */
	public function orders( array $orderIds, array $refundedIds = array() ): array {
		$out = array();
		foreach ( $orderIds as $orderId ) {
			$order = $this->shop->order( (int) $orderId );
			if ( ! $order ) {
				continue;
			}
			$subs = array();
			foreach ( $this->shop->subscriptionIdsForOrder( $order['id'], array( 'parent', 'renewal' ) ) as $subId ) {
				$plans = $this->plans( (int) $subId );
				if ( $plans ) {
					$subs[] = array( 'id' => (int) $subId, 'plans' => $plans );
				}
			}
			$gift   = WelcomeGift::isGiftOrder( $order );
			$credit = false;
			$billing = false;
			foreach ( $order['lines'] as $line ) {
				$meta = $this->shop->productMeta( (int) $line['product_id'] );
				$billing = $billing || CheckoutGate::isBillingProduct( $meta );
				if ( $meta['credit_units'] > 0 && ( $gift || (float) ( $line['total'] ?? 0 ) > 0 ) ) {
					$credit = true;
				}
			}
			if ( ! $subs && ! $billing ) {
				continue; // not an AwareWave order
			}
			$granted = $this->shop->wasGranted( $order['id'] );
			$reason  = null;
			if ( $granted ) {
				$reason = null;
			} elseif ( $order['customer_id'] < 1 ) {
				$reason = 'guest';
			} elseif ( ! $gift && ! in_array( $order['payment_method'], $this->allowedGateways, true ) ) {
				$reason = 'method_not_allowed';
			}
			$row = array(
				'id'             => $order['id'],
				'date_paid'      => (int) ( $order['date_paid'] ?? 0 ),
				'payment_method' => $order['payment_method'],
				'credit'         => $credit,
				'subscriptions'  => $subs,
				'auto'           => $reason === null,
				'granted'        => $granted,
				'refunded'       => in_array( (int) $order['id'], $refundedIds, true ),
			);
			if ( $reason !== null ) {
				$row['reason'] = $reason;
			}
			$out[] = $row;
		}
		return $out;
	}

	// ---- WordPress wiring ----

	public static function register( Shop $shop, Settings $settings ): void {
		add_action(
			'rest_api_init',
			function () use ( $shop, $settings ) {
				register_rest_route(
					self::ROUTE_NS,
					self::ROUTE,
					array(
						'methods'             => 'GET',
						// The signature is the authentication; WordPress users have nothing to do with it.
						'permission_callback' => '__return_true',
						'callback'            => function ( \WP_REST_Request $req ) use ( $shop, $settings ) {
							$from = (int) $req->get_param( 'from' );
							$to   = (int) $req->get_param( 'to' );
							$ts   = (int) $req->get_header( str_replace( '-', '_', strtolower( self::TS_HEADER ) ) );
							$sig  = (string) $req->get_header( str_replace( '-', '_', strtolower( self::SIG_HEADER ) ) );
							if ( ! self::verify( $settings->paymentsSecret, $from, $to, $ts, $sig, time() ) ) {
								return new \WP_REST_Response( array( 'ok' => false, 'error' => 'unauthorized' ), 401 );
							}
							if ( ! function_exists( 'wc_get_orders' ) ) {
								return new \WP_REST_Response( array( 'ok' => false, 'error' => 'woocommerce_inactive' ), 503 );
							}
							$query = function ( array $statuses ) use ( $from, $to ) {
								return array_map(
									'intval',
									(array) wc_get_orders(
										array(
											'type'      => 'shop_order',
											'status'    => $statuses,
											'date_paid' => $from . '...' . ( $to - 1 ),
											'limit'     => -1,
											'return'    => 'ids',
										)
									)
								);
							};
							// refunded: it was paid (its payment event exists) and it should also have its refund event.
							$refunded = $query( array( 'wc-refunded' ) );
							$ids      = array_merge( $query( array( 'wc-processing', 'wc-completed' ) ), $refunded );
							return new \WP_REST_Response( array( 'ok' => true, 'orders' => ( new self( $shop, $settings->allowedGateways ) )->orders( $ids, $refunded ) ), 200 );
						},
					)
				);
			}
		);
	}
}
