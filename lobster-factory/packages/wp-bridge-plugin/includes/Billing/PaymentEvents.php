<?php
/**
 * WooCommerce / WooCommerce Subscriptions actions → one signed PaymentEvent each, queued for PaymentSender
 * (ADR 017 4b-2; table in agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md 「4b 設計更新」).
 * Wire contract = next-admin lib/payments/woo-billing.ts + provider.ts toPaymentEvent: no organization_id;
 * chargebacks are never sent (the operator records them by hand).
 *
 * event_id is deterministic per action, so a hook firing twice queues the same id and the server's inbox drops the
 * second. Subscription events carry plan_key in the id: WCS puts same-schedule products into ONE subscription.
 *
 * @package AwareWave\WpBridge\Billing
 */

namespace AwareWave\WpBridge\Billing;

final class PaymentEvents {

	const EVENT_ID       = '/^[\w.:\-\/#]{1,200}$/';
	const KEY            = '/^[a-z0-9][a-z0-9_.-]{0,99}$/';
	const MAX_UNITS      = 10000000;
	const MAX_PERIOD_SEC = 94608000; // 3 years
	const PACK_PLAN_SEC  = 94176000; // 1090 days: under the server's 3-year limit

	/** @var Shop */
	private $shop;
	/** @var Members */
	private $members;
	/** @var Queue */
	private $queue;
	/** @var callable():int */
	private $clock;

	public function __construct( Shop $shop, Members $members, Queue $queue, ?callable $clock = null ) {
		$this->shop    = $shop;
		$this->members = $members;
		$this->queue   = $queue;
		$this->clock   = $clock ?? 'time';
	}

	/** woocommerce_payment_complete: subscriptions this order STARTED (parent) + credit packs on it. Renewal and switch orders start nothing here. */
	public function onPaymentComplete( int $orderId ): void {
		$order = $this->shop->order( $orderId );
		if ( ! $order ) {
			return;
		}
		$parents = $this->shop->subscriptionIdsForOrder( $orderId, array( 'parent' ) );
		if ( ! $parents && ! $this->hasBillingLine( $order['lines'] ) ) {
			return; // not an AwareWave order (the status hooks see every order in the shop)
		}
		if ( $order['customer_id'] < 1 ) {
			$this->shop->addNote( $orderId, 'AwareWave：訪客訂單沒有會員可記帳，未送付款事件；請人工對帳。' );
			return;
		}
		foreach ( $parents as $subId ) {
			$this->subscriptionPaid( 'payment_complete', (int) $subId, $orderId );
		}
		$units     = 0;
		$packPlans = array();
		$noPlan    = false;
		foreach ( $order['lines'] as $line ) {
			$meta = $this->shop->productMeta( (int) $line['product_id'] );
			if ( $meta['credit_units'] > 0 ) {
				$units += $meta['credit_units'] * max( 0, (int) $line['qty'] );
				if ( preg_match( self::KEY, $meta['plan_key'] ) ) {
					$packPlans[ $meta['plan_key'] ] = true;
				} else {
					$noPlan = true;
				}
			}
		}
		if ( $noPlan ) {
			$this->shop->addNote( $orderId, '點數包未設定使用方案：買家無法使用點數' );
		}
		if ( $units > 0 ) {
			if ( $units > self::MAX_UNITS ) {
				$this->shop->addNote( $orderId, 'AwareWave：點數 ' . $units . ' 超過單筆上限 ' . self::MAX_UNITS . '，未送出；請人工登記。' );
				return;
			}
			$this->emit(
				$order['customer_id'],
				$orderId,
				'wc:payment_complete:' . $orderId . ':credit_pack',
				array( 'kind' => 'credit_pack', 'units' => $units, 'order_ref' => (string) $orderId )
			);
			// A wallet alone opens nothing (can.ts, 4b-5): the pack's add-on plan grants the right to spend it. The server
			// renews the same contract on each purchase and never shortens it, so the right runs ~3 years past the last pack.
			$end = (int) call_user_func( $this->clock ) + self::PACK_PLAN_SEC;
			foreach ( array_keys( $packPlans ) as $plan ) {
				$this->emit(
					$order['customer_id'],
					$orderId,
					'wc:payment_complete:' . $orderId . ':pack-plan:' . $plan,
					array(
						'kind'         => 'subscription_paid',
						'plan_key'     => $plan,
						'period_end'   => gmdate( 'Y-m-d\TH:i:s\Z', $end ),
						'external_ref' => 'pack:' . $orderId,
					)
				);
			}
		}
	}

	/** woocommerce_subscription_renewal_payment_complete. */
	public function onRenewalPaymentComplete( int $subscriptionId ): void {
		$this->subscriptionPaid( 'subscription_renewal_payment_complete', $subscriptionId, $subscriptionId );
	}

	/** woocommerce_subscriptions_switched_item: the new item's plan; the item id makes a second switch in one period its own event. */
	public function onSwitchedItem( int $subscriptionId, int $newProductId, int $newItemId ): void {
		$sub = $this->shop->subscription( $subscriptionId );
		if ( ! $sub ) {
			return;
		}
		$plan = $this->shop->productMeta( $newProductId )['plan_key'];
		if ( $plan === '' ) {
			return;
		}
		$this->paidEvent( 'subscriptions_switched_item', $sub, $plan, $subscriptionId, (string) $newItemId );
	}

	/** woocommerce_order_status_refunded, full refunds only (partial: the operator records a `local` refund). */
	public function onOrderRefunded( int $orderId ): void {
		$order = $this->shop->order( $orderId );
		if ( ! $order ) {
			return;
		}
		$subs = $this->shop->subscriptionIdsForOrder( $orderId, array( 'parent', 'renewal', 'switch' ) );
		if ( ! $subs && ! $this->hasBillingLine( $order['lines'] ) ) {
			return;
		}
		if ( $order['total_refunded'] + 0.005 < $order['total'] ) {
			$this->shop->addNote( $orderId, 'AwareWave：部分退款不送事件；需要時請用 record-payment.mjs 登記 local refund。' );
			return;
		}
		foreach ( $subs as $subId ) {
			$sub = $this->shop->subscription( (int) $subId );
			if ( ! $sub ) {
				continue;
			}
			foreach ( $this->planKeys( $sub['lines'] ) as $plan ) {
				$this->emit(
					$order['customer_id'],
					$orderId,
					'wc:order_status_refunded:' . $orderId . ':' . (int) $subId . ':' . $plan,
					array( 'kind' => 'refund', 'target' => 'subscription', 'plan_key' => $plan )
				);
			}
		}
		foreach ( $order['lines'] as $line ) {
			if ( $this->shop->productMeta( (int) $line['product_id'] )['credit_units'] > 0 ) {
				$this->emit(
					$order['customer_id'],
					$orderId,
					'wc:order_status_refunded:' . $orderId . ':credit_pack',
					array( 'kind' => 'refund', 'target' => 'credit_pack', 'order_ref' => (string) $orderId )
				);
				break;
			}
		}
	}

	/** woocommerce_subscription_status_cancelled / _expired ($status = cancelled | expired). Not pending-cancel, not on-hold. */
	public function onSubscriptionEnded( int $subscriptionId, string $status ): void {
		$sub = $this->shop->subscription( $subscriptionId );
		if ( ! $sub || ! in_array( $status, array( 'cancelled', 'expired' ), true ) ) {
			return;
		}
		foreach ( $this->planKeys( $sub['lines'] ) as $plan ) {
			$this->emit(
				$sub['customer_id'],
				$subscriptionId,
				'wc:subscription_status_' . $status . ':' . $subscriptionId . ':' . $plan,
				array( 'kind' => 'subscription_canceled', 'plan_key' => $plan )
			);
		}
	}

	private function subscriptionPaid( string $action, int $subscriptionId, int $noteId ): void {
		$sub = $this->shop->subscription( $subscriptionId );
		if ( ! $sub ) {
			return;
		}
		foreach ( $this->planKeys( $sub['lines'] ) as $plan ) {
			$this->paidEvent( $action, $sub, $plan, $noteId, '' );
		}
	}

	/** @param array{id:int,customer_id:int,next_payment:int,end:int} $sub */
	private function paidEvent( string $action, array $sub, string $plan, int $noteId, string $extra ): void {
		$now = (int) call_user_func( $this->clock );
		$end = $sub['next_payment'] > 0 ? $sub['next_payment'] : $sub['end'];
		if ( $end <= $now || $end > $now + self::MAX_PERIOD_SEC ) {
			$this->shop->addNote( $noteId, 'AwareWave：訂閱 #' . $sub['id'] . ' 沒有有效的下次扣款／結束日（須在未來 3 年內），未送付款事件；請人工登記。' );
			return;
		}
		$this->emit(
			$sub['customer_id'],
			$noteId,
			'wc:' . $action . ':' . $sub['id'] . ':' . $plan . ( $extra !== '' ? ':' . $extra : '' ) . ':' . $end,
			array(
				'kind'         => 'subscription_paid',
				'plan_key'     => $plan,
				'period_end'   => gmdate( 'Y-m-d\TH:i:s\Z', $end ),
				'external_ref' => (string) $sub['id'],
			),
			$sub['id']
		);
	}

	/** @param list<array{product_id:int,qty:int}> $lines */
	private function hasBillingLine( array $lines ): bool {
		foreach ( $lines as $line ) {
			if ( CheckoutGate::isBillingProduct( $this->shop->productMeta( (int) $line['product_id'] ) ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Distinct valid plan keys of subscription lines; credit-pack products are never a plan.
	 *
	 * @param list<array{product_id:int,qty:int}> $lines
	 * @return list<string>
	 */
	private function planKeys( array $lines ): array {
		$keys = array();
		foreach ( $lines as $line ) {
			$meta = $this->shop->productMeta( (int) $line['product_id'] );
			if ( $meta['credit_units'] === 0 && preg_match( self::KEY, $meta['plan_key'] ) ) {
				$keys[ $meta['plan_key'] ] = true;
			}
		}
		return array_keys( $keys );
	}

	/** Member fields + the event, queued with its body frozen: a retry signs and sends the very same bytes. */
	private function emit( int $customerId, int $noteId, string $eventId, array $event, int $subscriptionId = 0 ): void {
		if ( $customerId < 1 ) {
			$this->shop->addNote( $noteId, 'AwareWave：訪客訂單沒有會員可記帳，未送付款事件 ' . $eventId . '；請人工對帳。' );
			return;
		}
		$member = $this->members->member( $customerId );
		if ( ! $member ) {
			$this->shop->addNote( $noteId, 'AwareWave：找不到會員 #' . $customerId . '，未送付款事件 ' . $eventId . '。' );
			return;
		}
		if ( ! preg_match( self::EVENT_ID, $eventId ) ) {
			$this->shop->addNote( $noteId, 'AwareWave：事件編號格式不符，未送出：' . $eventId );
			return;
		}
		$body = array(
			'event_id'       => $eventId,
			'wp_user_id'     => $customerId,
			'email'          => $member['email'],
			'email_verified' => EmailVerification::isVerified( $member['verified_email'], $member['email'] ),
			// ≤100 code points = ≤200 UTF-16 units, the server's limit; no mbstring needed.
			'display_name'   => (string) preg_replace( '/^(.{0,100}).*$/us', '$1', $member['display_name'] ),
		) + $event;
		$this->queue->enqueue(
			array(
				'event_id' => $eventId,
				'body'     => (string) json_encode( $body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE ),
				'note_id'  => $noteId,
				'attempt'  => 0,
			) + ( $subscriptionId > 0 ? array( 'subscription_id' => $subscriptionId ) : array() )
		);
	}
}
