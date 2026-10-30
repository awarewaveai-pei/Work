<?php
/**
 * Reconcile: which paid orders next-admin should find a payment event for (lib/payments/woo-reconcile.ts).
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\Reconcile;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class ReconcileTest extends TestCase {

	public function test_signature_matches_next_admin_fixed_vector(): void {
		// Same vector as next-admin lib/payments/__tests__/woo-reconcile.test.ts.
		$this->assertSame( 'qjddtxgRPDNXBt0SNPj7A36sCY74T0ZSnPBHz8Pl54k=', Reconcile::signature( 'test-secret', 1700000000, 1700604800, 1700604900 ) );
	}

	public function test_verify_refuses_stale_wrong_or_oversized_requests(): void {
		$sig = Reconcile::signature( 's', 100, 200, 1000 );
		$this->assertTrue( Reconcile::verify( 's', 100, 200, 1000, $sig, 1100 ) );
		$this->assertFalse( Reconcile::verify( 's', 100, 200, 1000, $sig, 1000 + Reconcile::MAX_SKEW_SEC + 1 ) );
		$this->assertFalse( Reconcile::verify( 'other', 100, 200, 1000, $sig, 1100 ) );
		$this->assertFalse( Reconcile::verify( '', 100, 200, 1000, $sig, 1100 ) );
		$big = Reconcile::signature( 's', 0, Reconcile::MAX_WINDOW + 1, 1000 );
		$this->assertFalse( Reconcile::verify( 's', 0, Reconcile::MAX_WINDOW + 1, 1000, $big, 1100 ) );
	}

	public function test_orders_lists_awarewave_orders_and_whether_the_plugin_sends_them(): void {
		$shop                    = new FakeShop();
		$shop->products[20]      = array( 'plan_key' => 'credits-300', 'credit_units' => 300 );
		$shop->products[30]      = array(); // not ours
		$shop->products[10]      = array( 'plan_key' => 'studio_basic' );
		$line                    = function ( int $p, float $t ) { return array( 'product_id' => $p, 'qty' => 1, 'total' => $t ); };
		$order                   = function ( int $id, string $method, array $lines, int $customer = 7 ) {
			return array( 'id' => $id, 'customer_id' => $customer, 'payment_method' => $method, 'total' => 1.0, 'total_refunded' => 0.0, 'date_paid' => 1800000000, 'lines' => $lines );
		};
		$shop->orders[1]         = $order( 1, 'ecpay', array( $line( 20, 300 ) ) );
		$shop->orders[2]         = $order( 2, 'cod', array( $line( 20, 300 ) ) );
		$shop->orders[3]         = $order( 3, 'ecpay', array( $line( 30, 99 ) ) );
		$shop->orders[4]         = $order( 4, 'ecpay', array( $line( 10, 500 ) ) );
		$shop->relations[4]      = array( 'parent' => array( 77 ) );
		$shop->subscriptions[77] = array( 'id' => 77, 'customer_id' => 7, 'status' => 'active', 'payment_method' => 'ecpay', 'next_payment' => 0, 'end' => 0, 'lines' => array( $line( 10, 500 ), $line( 11, 100 ) ) );
		$shop->products[11]      = array( 'plan_key' => 'tarot_basic' );
		$shop->orders[6]         = $order( 6, 'ecpay', array( $line( 30, 9 ) ) );
		$shop->relations[6]      = array( 'parent' => array( 88 ) ); // a subscription with no AwareWave plan: not ours
		$shop->subscriptions[88] = array( 'id' => 88, 'customer_id' => 7, 'status' => 'active', 'payment_method' => 'ecpay', 'next_payment' => 0, 'end' => 0, 'lines' => array( $line( 30, 9 ) ) );
		$shop->orders[7]         = $order( 7, 'cod', array( $line( 20, 300 ) ) );
		$shop->granted[7]        = true; // sent while cod was on the list: still the plugin's
		$shop->orders[5]         = $order( 5, 'ecpay', array( $line( 20, 0 ) ) ); // a free credit line adds none
		$rows                    = ( new Reconcile( $shop, array( 'ecpay' ) ) )->orders( array( 1, 2, 3, 4, 5, 6, 7, 999 ), array( 1 ) );
		$byId                    = array();
		foreach ( $rows as $r ) {
			$byId[ $r['id'] ] = $r;
		}
		$this->assertSame( array( 1, 2, 4, 5, 7 ), array_keys( $byId ) );
		$this->assertTrue( $byId[1]['auto'] && $byId[1]['credit'] && $byId[1]['refunded'] );
		$this->assertSame( array( false, 'method_not_allowed' ), array( $byId[2]['auto'], $byId[2]['reason'] ) );
		$this->assertSame( array( array( 'id' => 77, 'plans' => array( 'studio_basic', 'tarot_basic' ) ) ), $byId[4]['subscriptions'] );
		$this->assertFalse( $byId[5]['credit'] );
		$this->assertTrue( $byId[7]['auto'] && $byId[7]['granted'] );
	}
}
