<?php
/**
 * Sign-up gift and Google sign-up (decision 2026-10-30-customer-self-signup-email-google): the gift order is the one
 * unpaid order PaymentEvents accepts, a priced product is never given away, and only a Google-hosted mailbox counts
 * as proven by Google.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\GoogleSignup;
use AwareWave\Store\PaymentEvents;
use AwareWave\Store\WelcomeGift;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class WelcomeGiftTest extends TestCase {

	/** @var FakeShop */
	private $shop;
	/** @var FakeQueue */
	private $queue;
	/** @var PaymentEvents */
	private $events;

	protected function setUp(): void {
		$this->shop    = new FakeShop();
		$this->queue   = new FakeQueue();
		$members       = new FakeMembers();
		$members->members[7] = array( 'email' => 'mei@example.com', 'display_name' => '小美', 'verified_email' => 'mei@example.com' );
		$this->events  = new PaymentEvents( $this->shop, $members, $this->queue, array( 'tappay' ), function () {
			return 1793000000;
		} );
		$this->shop->products[40] = array( 'plan_key' => 'studio_credits tarot_credits', 'credit_units' => 50, 'product_key' => 'studio' );
	}

	private function giftOrder( int $id, string $method, float $total ): void {
		$this->shop->orders[ $id ] = array( 'id' => $id, 'customer_id' => 7, 'payment_method' => $method, 'total' => $total, 'total_refunded' => 0.0, 'lines' => array( array( 'product_id' => 40, 'qty' => 1, 'total' => 0.0 ) ) );
	}

	public function test_a_free_credit_line_in_a_paid_order_adds_no_credits(): void {
		// critic 2026-10-30 C1: the gift product (or a pack under a 100% coupon) slipped into a cart with something paid
		$this->shop->products[20] = array( 'plan_key' => 'credits-300', 'credit_units' => 300 );
		$this->shop->orders[600]  = array( 'id' => 600, 'customer_id' => 7, 'payment_method' => 'tappay', 'total' => 99.0, 'total_refunded' => 0.0, 'lines' => array(
			array( 'product_id' => 20, 'qty' => 1, 'total' => 99.0 ),
			array( 'product_id' => 40, 'qty' => 1000, 'total' => 0.0 ),
		) );
		$this->events->onPaymentComplete( 600 );
		$this->assertCount( 1, $this->queue->jobs );
		$this->assertSame( 300, json_decode( $this->queue->jobs[0]['body'], true )['units'] );
		$this->assertCount( 1, $this->shop->notes );
		// only free lines: nothing at all
		$this->queue->jobs = array();
		$this->shop->orders[601] = array( 'id' => 601, 'customer_id' => 7, 'payment_method' => 'tappay', 'total' => 0.0, 'total_refunded' => 0.0, 'lines' => array( array( 'product_id' => 20, 'qty' => 1, 'total' => 0.0 ) ) );
		$this->events->onPaymentComplete( 601 );
		$this->assertCount( 0, $this->queue->jobs );
	}

	public function test_one_mailbox_one_key_whatever_the_alias(): void {
		$k = WelcomeGift::mailboxKey( 'mei.lin@gmail.com' );
		$this->assertNotSame( '', $k );
		foreach ( array( 'MeiLin@gmail.com', 'm.e.i.l.i.n+promo@gmail.com', 'meilin@googlemail.com', ' mei.lin+1@GMAIL.com ' ) as $alias ) {
			$this->assertSame( $k, WelcomeGift::mailboxKey( $alias ), $alias );
		}
		// outside Gmail a dot is part of the address; a +tag is still the same mailbox
		$this->assertNotSame( WelcomeGift::mailboxKey( 'mei.lin@company.com' ), WelcomeGift::mailboxKey( 'meilin@company.com' ) );
		$this->assertSame( WelcomeGift::mailboxKey( 'mei@company.com' ), WelcomeGift::mailboxKey( 'mei+x@company.com' ) );
		foreach ( array( '', 'no-at', '@x.com', 'a@', '+tag@gmail.com' ) as $bad ) {
			$this->assertSame( '', WelcomeGift::mailboxKey( $bad ), $bad );
		}
	}

	public function test_the_gift_order_sends_a_credit_pack_with_its_plan_like_any_paid_order(): void {
		$this->giftOrder( 500, WelcomeGift::METHOD, 0.0 );
		$this->events->onPaymentComplete( 500 );
		$this->assertCount( 1, $this->queue->jobs );
		$b = json_decode( $this->queue->jobs[0]['body'], true );
		$this->assertSame( 'credit_pack', $b['kind'] );
		$this->assertSame( 50, $b['units'] );
		$this->assertSame( array( 'studio_credits', 'tarot_credits' ), $b['plan_keys'] );
		$this->assertSame( '500', $b['order_ref'] );
		$this->assertSame( true, $b['email_verified'] );
	}

	public function test_the_gift_method_on_a_charged_order_or_an_unlisted_method_at_zero_sends_nothing(): void {
		$this->giftOrder( 501, WelcomeGift::METHOD, 10.0 );
		$this->giftOrder( 502, 'cod', 0.0 );
		$this->events->onPaymentComplete( 501 );
		$this->events->onPaymentComplete( 502 );
		$this->assertCount( 0, $this->queue->jobs );
		$this->assertCount( 2, $this->shop->notes );
	}

	public function test_only_a_free_private_credit_pack_may_be_given(): void {
		$pack = array( 'plan_key' => 'studio_credits', 'credit_units' => 50, 'product_key' => 'studio' );
		$this->assertTrue( WelcomeGift::giftable( $pack, 0.0, 'private' ) );
		$this->assertFalse( WelcomeGift::giftable( $pack, 199.0, 'private' ) );
		$this->assertFalse( WelcomeGift::giftable( $pack, 0.0, 'publish' ), 'a published product can be put in any cart' );
		$this->assertFalse( WelcomeGift::giftable( array( 'credit_units' => 0 ) + $pack, 0.0, 'private' ) );
	}

	public function test_google_proves_only_its_own_mailboxes_and_only_the_members_address(): void {
		$this->assertTrue( GoogleSignup::provenByGoogle( 'Mei@Gmail.com', 'mei@gmail.com' ) );
		$this->assertTrue( GoogleSignup::provenByGoogle( 'mei@googlemail.com', 'mei@googlemail.com' ) );
		$this->assertFalse( GoogleSignup::provenByGoogle( 'mei@company.com', 'mei@company.com' ) );
		$this->assertFalse( GoogleSignup::provenByGoogle( 'mei@gmail.com', 'other@gmail.com' ) );
		$this->assertFalse( GoogleSignup::provenByGoogle( '', '' ) );
		$this->assertFalse( GoogleSignup::provenByGoogle( 'mei@gmail.com.evil.test', 'mei@gmail.com.evil.test' ) );
	}
}
