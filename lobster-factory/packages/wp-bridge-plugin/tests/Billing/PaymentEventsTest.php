<?php
/**
 * ADR 017 4b-2: WooCommerce actions → PaymentEvent bodies next-admin accepts (lib/payments/woo-billing.ts,
 * provider.ts toPaymentEvent). Test names are the acceptance names in cards/step-4.md 4b-2.
 */

namespace AwareWave\WpBridge\Tests\Billing;

use AwareWave\WpBridge\Billing\CheckoutGate;
use AwareWave\WpBridge\Billing\EmailVerification;
use AwareWave\WpBridge\Billing\PaymentEvents;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class PaymentEventsTest extends TestCase {

	const NOW = 1793000000; // 2026-10-26

	/** @var FakeShop */
	private $shop;
	/** @var FakeMembers */
	private $members;
	/** @var FakeQueue */
	private $queue;
	/** @var PaymentEvents */
	private $events;

	protected function setUp(): void {
		$this->shop    = new FakeShop();
		$this->members = new FakeMembers();
		$this->queue   = new FakeQueue();
		$this->events  = new PaymentEvents( $this->shop, $this->members, $this->queue, function () {
			return self::NOW;
		} );
		$this->shop->products[10] = array( 'plan_key' => 'tarot-monthly' );
		$this->shop->products[20] = array( 'plan_key' => 'credits-300', 'credit_units' => 300 );
		$this->shop->products[30] = array(); // a non-AwareWave shop product
		$this->members->members[7] = array( 'email' => 'Mei@Example.com', 'display_name' => '小美', 'verified_email' => 'mei@example.com' );
	}

	private function order( int $id, int $customer, array $lines, float $total = 100.0, float $refunded = 0.0 ): void {
		$this->shop->orders[ $id ] = array( 'id' => $id, 'customer_id' => $customer, 'total' => $total, 'total_refunded' => $refunded, 'lines' => $lines );
	}

	private function body( int $i = 0 ): array {
		return json_decode( $this->queue->jobs[ $i ]['body'], true );
	}

	public function test_a_paid_order_with_a_plan_product_becomes_subscription_paid_with_the_subscription_next_payment_as_period_end(): void {
		$next = self::NOW + 30 * 86400;
		$this->order( 100, 7, array( array( 'product_id' => 10, 'qty' => 1 ) ) );
		$this->shop->relations[100]['parent'] = array( 101 );
		$this->shop->subscriptions[101] = array( 'id' => 101, 'customer_id' => 7, 'next_payment' => $next, 'end' => self::NOW + 400 * 86400, 'lines' => array( array( 'product_id' => 10, 'qty' => 1 ) ) );

		$this->events->onPaymentComplete( 100 );

		$this->assertCount( 1, $this->queue->jobs );
		$b = $this->body();
		$this->assertSame( 'subscription_paid', $b['kind'] );
		$this->assertSame( 'tarot-monthly', $b['plan_key'] );
		$this->assertSame( gmdate( 'Y-m-d\TH:i:s\Z', $next ), $b['period_end'] );
		$this->assertSame( '101', $b['external_ref'] );
		$this->assertSame( 7, $b['wp_user_id'] );
		$this->assertSame( true, $b['email_verified'] );
		$this->assertArrayNotHasKey( 'organization_id', $b );
		$this->assertMatchesRegularExpression( PaymentEvents::EVENT_ID, $b['event_id'] );
		$this->assertMatchesRegularExpression( '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/', $b['period_end'] );

		// Without next_payment the subscription end is the period end.
		$this->queue->jobs = array();
		$this->shop->subscriptions[101]['next_payment'] = 0;
		$this->events->onPaymentComplete( 100 );
		$this->assertSame( gmdate( 'Y-m-d\TH:i:s\Z', self::NOW + 400 * 86400 ), $this->body()['period_end'] );
	}

	public function test_a_credit_pack_order_sums_units_by_quantity(): void {
		$this->shop->products[21] = array( 'plan_key' => 'credits-50', 'credit_units' => 50 );
		$this->order( 200, 7, array( array( 'product_id' => 20, 'qty' => 2 ), array( 'product_id' => 21, 'qty' => 3 ), array( 'product_id' => 30, 'qty' => 5 ) ) );

		$this->events->onPaymentComplete( 200 );

		$this->assertCount( 3, $this->queue->jobs ); // the pack + one plan event per pack plan key
		$b = $this->body();
		$this->assertSame( 'credit_pack', $b['kind'] );
		$this->assertSame( 750, $b['units'] );
		$this->assertSame( '200', $b['order_ref'] );
	}

	public function test_an_order_with_a_subscription_and_a_pack_is_two_events_with_two_ids(): void {
		$this->order( 250, 7, array( array( 'product_id' => 10, 'qty' => 1 ), array( 'product_id' => 20, 'qty' => 1 ) ) );
		$this->shop->relations[250]['parent'] = array( 251 );
		$this->shop->subscriptions[251] = array( 'id' => 251, 'customer_id' => 7, 'next_payment' => self::NOW + 86400, 'end' => 0, 'lines' => array( array( 'product_id' => 10, 'qty' => 1 ) ) );

		$this->events->onPaymentComplete( 250 );

		$this->assertSame( array( 'subscription_paid', 'credit_pack' ), array( $this->body( 0 )['kind'], $this->body( 1 )['kind'] ) );
		$this->assertCount( 3, array_unique( array_column( $this->queue->jobs, 'event_id' ) ) );
	}

	public function test_a_full_refund_of_a_pack_order_becomes_refund_credit_pack(): void {
		$this->order( 300, 7, array( array( 'product_id' => 20, 'qty' => 1 ) ), 990.0, 990.0 );

		$this->events->onOrderRefunded( 300 );

		$this->assertCount( 1, $this->queue->jobs );
		$b = $this->body();
		$this->assertSame( array( 'refund', 'credit_pack', '300' ), array( $b['kind'], $b['target'], $b['order_ref'] ) );

		// A partial refund sends nothing and says so on the order.
		$this->queue->jobs = array();
		$this->order( 301, 7, array( array( 'product_id' => 20, 'qty' => 1 ) ), 990.0, 100.0 );
		$this->events->onOrderRefunded( 301 );
		$this->assertCount( 0, $this->queue->jobs );
		$this->assertSame( 301, $this->shop->notes[0][0] );
	}

	public function test_a_guest_order_is_dropped_with_an_order_note_and_never_queued(): void {
		$this->order( 400, 0, array( array( 'product_id' => 20, 'qty' => 1 ) ) );

		$this->events->onPaymentComplete( 400 );

		$this->assertCount( 0, $this->queue->jobs );
		$this->assertCount( 1, $this->shop->notes );
		$this->assertSame( 400, $this->shop->notes[0][0] );
		$this->assertStringContainsString( '訪客', $this->shop->notes[0][1] );

		// A guest order of other shop products is none of our business: no note, nothing queued.
		$this->order( 401, 0, array( array( 'product_id' => 30, 'qty' => 1 ) ) );
		$this->events->onPaymentComplete( 401 );
		$this->events->onOrderRefunded( 401 );
		$this->assertCount( 1, $this->shop->notes );
		$this->assertCount( 0, $this->queue->jobs );
	}

	public function test_the_same_action_twice_yields_the_same_event_id(): void {
		$this->order( 500, 7, array( array( 'product_id' => 20, 'qty' => 1 ) ) );
		$this->shop->subscriptions[501] = array( 'id' => 501, 'customer_id' => 7, 'next_payment' => self::NOW + 86400, 'end' => 0, 'lines' => array( array( 'product_id' => 10, 'qty' => 1 ) ) );

		$this->events->onPaymentComplete( 500 );
		$this->events->onPaymentComplete( 500 );
		$this->events->onRenewalPaymentComplete( 501 );
		$this->events->onRenewalPaymentComplete( 501 );
		$this->events->onSubscriptionEnded( 501, 'cancelled' );
		$this->events->onSubscriptionEnded( 501, 'cancelled' );

		$ids = array_column( $this->queue->jobs, 'event_id' );
		$this->assertCount( 8, $ids ); // payment_complete = credit_pack + pack plan, each twice
		$this->assertSame( array_slice( $ids, 0, 2 ), array_slice( $ids, 2, 2 ) );
		$this->assertSame( $ids[4], $ids[5] );
		$this->assertSame( $ids[6], $ids[7] );
		$this->assertCount( 4, array_unique( $ids ) );
		$this->assertSame( 'subscription_canceled', $this->body( 6 )['kind'] );
	}

	public function test_an_unverified_member_cannot_check_out_and_no_event_carries_email_verified_true(): void {
		// Never verified, and verified an address they have since changed: both unverified.
		$this->members->members[8] = array( 'email' => 'new@example.com', 'display_name' => 'A', 'verified_email' => '' );
		$this->members->members[9] = array( 'email' => 'new@example.com', 'display_name' => 'B', 'verified_email' => 'old@example.com' );
		foreach ( array( 8, 9 ) as $uid ) {
			$this->assertFalse( EmailVerification::isVerified( $this->members->members[ $uid ]['verified_email'], $this->members->members[ $uid ]['email'] ) );
			$this->assertSame( 'email_unverified', CheckoutGate::refusal( true, false, true ) );
			$this->order( 600 + $uid, $uid, array( array( 'product_id' => 20, 'qty' => 1 ) ) );
			$this->events->onPaymentComplete( 600 + $uid );
		}
		$this->assertCount( 4, $this->queue->jobs );
		foreach ( array_keys( $this->queue->jobs ) as $i ) {
			$this->assertFalse( $this->body( $i )['email_verified'] );
		}

		$this->assertSame( 'login_required', CheckoutGate::refusal( false, false, true ) );
		$this->assertNull( CheckoutGate::refusal( true, true, true ) );
		$this->assertNull( CheckoutGate::refusal( false, false, false ), 'other shop products are not gated' );
	}

	public function test_a_credit_pack_with_a_plan_key_also_sends_subscription_paid_for_that_plan(): void {
		$this->order( 700, 7, array( array( 'product_id' => 20, 'qty' => 2 ) ) );

		$this->events->onPaymentComplete( 700 );

		$this->assertCount( 2, $this->queue->jobs );
		$this->assertSame( 'credit_pack', $this->body( 0 )['kind'] );
		$plan = $this->body( 1 );
		$this->assertSame( 'subscription_paid', $plan['kind'] );
		$this->assertSame( 'credits-300', $plan['plan_key'] );
		$this->assertSame( 'pack:700', $plan['external_ref'] );
		$this->assertSame( gmdate( 'Y-m-d\TH:i:s\Z', self::NOW + 1090 * 86400 ), $plan['period_end'] );
		$this->assertSame( 'wc:payment_complete:700:pack-plan:credits-300', $plan['event_id'] );
		$this->assertCount( 0, $this->shop->notes );

		// A pack without a plan key: points only, and the shop owner is told the buyer cannot spend them.
		$this->queue->jobs        = array();
		$this->shop->products[22] = array( 'credit_units' => 100 );
		$this->order( 701, 7, array( array( 'product_id' => 22, 'qty' => 1 ) ) );
		$this->events->onPaymentComplete( 701 );
		$this->assertCount( 1, $this->queue->jobs );
		$this->assertSame( 'credit_pack', $this->body()['kind'] );
		$this->assertSame( array( 701, '點數包未設定使用方案：買家無法使用點數' ), $this->shop->notes[0] );
	}

	public function test_a_verification_link_works_once_only_before_it_expires_and_only_for_the_address_it_was_sent_to(): void {
		$key   = 'test-site-key';
		$id    = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
		$token = EmailVerification::makeToken( 7, 'Mei@Example.com', self::NOW + 100, $id, $key );

		$ok = EmailVerification::check( $token, 'mei@example.com', $id, self::NOW, $key );
		$this->assertTrue( $ok['ok'] );
		$this->assertSame( 7, $ok['user_id'] );
		$this->assertSame( 'used', EmailVerification::check( $token, 'mei@example.com', '', self::NOW, $key )['error'] );
		$this->assertSame( 'expired', EmailVerification::check( $token, 'mei@example.com', $id, self::NOW + 101, $key )['error'] );
		$this->assertSame( 'bad_signature', EmailVerification::check( $token, 'other@example.com', $id, self::NOW, $key )['error'] );
		$this->assertSame( 'bad_signature', EmailVerification::check( str_replace( '.' . ( self::NOW + 100 ) . '.', '.' . ( self::NOW + 999 ) . '.', $token ), 'mei@example.com', $id, self::NOW, $key )['error'] );
	}
}
