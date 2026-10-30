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
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class PaymentEvents {

	const EVENT_ID       = '/^[\w.:\-\/#]{1,200}$/';
	const KEY            = '/^[a-z0-9][a-z0-9_.-]{0,99}$/';
	const MAX_UNITS      = 10000000;
	const MAX_PERIOD_SEC = 94608000; // 3 years

	/** @var Shop */
	private $shop;
	/** @var Members */
	private $members;
	/** @var Queue */
	private $queue;
	/** @var callable():int */
	private $clock;
	/** @var list<string> */
	private $allowedGateways;

	/**
	 * @param list<string> $allowedGateways payment methods that take the money BEFORE the order is processing (Settings).
	 */
	public function __construct( Shop $shop, Members $members, Queue $queue, array $allowedGateways, ?callable $clock = null ) {
		$this->shop            = $shop;
		$this->members         = $members;
		$this->queue           = $queue;
		$this->allowedGateways = array_values( array_map( 'strval', $allowedGateways ) );
		$this->clock           = $clock ?? 'time';
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
		// "processing" means paid only for methods that take the money first; cash on delivery / pay at pickup reach it unpaid.
		if ( ! $this->paidByAllowedMethod( $order['payment_method'], $orderId ) ) {
			return;
		}
		foreach ( $parents as $subId ) {
			$sub = $this->shop->subscription( (int) $subId );
			if ( $sub ) {
				foreach ( $this->planKeys( $sub['lines'] ) as $plan ) {
					$this->paidEvent( 'payment_complete', $sub, $plan, $orderId, '', $orderId, $order['date_paid'] ?? 0 );
				}
			}
		}
		$units     = 0;
		$packPlans = array();
		foreach ( $order['lines'] as $line ) {
			$meta = $this->shop->productMeta( (int) $line['product_id'] );
			if ( $meta['credit_units'] > 0 ) {
				$units += $meta['credit_units'] * max( 0, (int) $line['qty'] );
				if ( preg_match( self::KEY, $meta['plan_key'] ) ) {
					$packPlans[ $meta['plan_key'] ] = true;
				}
			}
		}
		if ( $units > 0 ) {
			if ( $units > self::MAX_UNITS ) {
				$this->shop->addNote( $orderId, 'AwareWave：點數 ' . $units . ' 超過單筆上限 ' . self::MAX_UNITS . '，未送出；請人工登記。' );
				return;
			}
			// One wallet per account, spent by any row marked pay=credits (can.ts, 4b-5): a pack without plan_key only tops it
			// up (each product's plan marks its credit features, 0144); with plan_key the server also writes that add-on
			// plan's rows with no end date, in the same transaction as the credits (0128).
			$pack = array( 'kind' => 'credit_pack', 'units' => $units, 'order_ref' => (string) $orderId ) + self::paidAt( $order['date_paid'] ?? 0 );
			if ( count( $packPlans ) === 1 ) {
				$pack['plan_key'] = (string) array_keys( $packPlans )[0];
			} elseif ( count( $packPlans ) > 1 ) {
				$this->shop->addNote( $orderId, '點數包使用方案不一致（' . implode( '、', array_keys( $packPlans ) ) . '）：點數已入帳，使用方案請人工登記' );
			}
			$this->emit(
				$order['customer_id'],
				$orderId,
				'wc:payment_complete:' . $orderId . ':credit_pack',
				$pack,
				0,
				$orderId
			);
		}
	}

	/**
	 * woocommerce_subscription_renewal_payment_complete($subscription, $renewalOrder). The renewal order's own method
	 * decides: a subscription stored with a card can still be renewed by a cash-on-delivery order (Codex 2026-10-25 F2).
	 */
	public function onRenewalPaymentComplete( int $subscriptionId, int $renewalOrderId = 0 ): void {
		$sub = $this->shop->subscription( $subscriptionId );
		if ( ! $sub ) {
			return;
		}
		$renewal = $renewalOrderId > 0 ? $this->shop->order( $renewalOrderId ) : null;
		$method  = $renewal ? $renewal['payment_method'] : $sub['payment_method'];
		$noteId  = $renewal ? $renewalOrderId : $subscriptionId;
		if ( ! $this->paidByAllowedMethod( $method, $noteId ) ) {
			return;
		}
		foreach ( $this->planKeys( $sub['lines'] ) as $plan ) {
			$this->paidEvent( 'subscription_renewal_payment_complete', $sub, $plan, $subscriptionId, '', $renewal ? $renewalOrderId : 0, $renewal ? ( $renewal['date_paid'] ?? 0 ) : 0 );
		}
	}

	/** woocommerce_subscriptions_switched_item: the new item's plan; the item id makes a second switch in one period its own event. */
	public function onSwitchedItem( int $subscriptionId, int $newProductId, int $newItemId ): void {
		$sub = $this->shop->subscription( $subscriptionId );
		if ( ! $sub || ! $this->paidByAllowedMethod( $sub['payment_method'], $subscriptionId ) ) {
			return;
		}
		$plan = $this->shop->productMeta( $newProductId )['plan_key'];
		if ( $plan === '' ) {
			return;
		}
		$this->paidEvent( 'subscriptions_switched_item', $sub, $plan, $subscriptionId, (string) $newItemId, 0 );
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
		// Take back only what this order granted; the allowlist may have changed since (Codex 2026-10-25 F3).
		if ( ! $this->shop->wasGranted( $orderId ) ) {
			$this->shop->addNote( $orderId, 'AwareWave：此訂單沒有自動開通過，退款不送事件；如曾人工開通請人工登記退款。' );
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

	/**
	 * paid_at: when the money was taken, from the order WooCommerce recorded it on -- never this plugin's clock: the
	 * same hook firing twice must send the same bytes (the server rejects one event id with two bodies), and a retry
	 * days later must still say when the buyer paid (the monthly seller report goes by it, migration 0142).
	 *
	 * @return array{paid_at?:string}
	 */
	private static function paidAt( int $datePaid ): array {
		return $datePaid > 0 ? array( 'paid_at' => gmdate( 'Y-m-d\TH:i:s\Z', $datePaid ) ) : array();
	}

	/** @param array{id:int,customer_id:int,next_payment:int,end:int} $sub */
	private function paidEvent( string $action, array $sub, string $plan, int $noteId, string $extra, int $grantOrderId, int $datePaid = 0 ): void {
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
			) + self::paidAt( $datePaid ),
			$sub['id'],
			$grantOrderId
		);
	}

	private function paidByAllowedMethod( string $method, int $noteId ): bool {
		if ( in_array( $method, $this->allowedGateways, true ) ) {
			return true;
		}
		$this->shop->addNote( $noteId, 'AwareWave：付款方式「' . ( $method === '' ? '無' : $method ) . '」不在自動開通名單（付款與會員設定頁），未送付款事件；收到款後請人工登記。' );
		return false;
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
	/** $grantOrderId: the order whose money this event turns into rights; marked so its full refund takes them back. */
	private function emit( int $customerId, int $noteId, string $eventId, array $event, int $subscriptionId = 0, int $grantOrderId = 0 ): void {
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
		if ( $grantOrderId > 0 ) {
			$this->shop->markGranted( $grantOrderId );
		}
	}
}
