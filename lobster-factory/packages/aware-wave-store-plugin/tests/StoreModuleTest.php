<?php
/**
 * The switch-over guard: while wp-bridge <= 0.18.3 (which still carries this code) is installed, the store plugin
 * must register nothing that acts, or every payment is queued twice. Each case runs in its own process because it
 * declares WordPress stubs and, in the first case, the bridge's legacy class.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\PaymentSender;
use AwareWave\Store\StoreModule;
use PHPUnit\Framework\TestCase;

final class StoreModuleTest extends TestCase {

	private function hooks(): array {
		require_once __DIR__ . '/stubs/wp-hooks.php';
		return $GLOBALS['awstore_test_hooks'];
	}

	/**
	 * @runInSeparateProcess
	 * @preserveGlobalState disabled
	 */
	public function test_while_the_old_bridge_still_carries_billing_the_store_plugin_registers_only_a_notice(): void {
		require_once __DIR__ . '/stubs/wp-hooks.php';
		require_once __DIR__ . '/stubs/legacy-bridge-billing.php';
		$GLOBALS['awstore_test_options'] = array( 'aware_wave_payments_enabled' => '1' ); // even switched on

		( new StoreModule() )->register();

		$this->assertTrue( StoreModule::legacyBridgeBillingLoaded() );
		$this->assertSame( array( 'admin_notices' ), $this->hooks() );
	}

	/**
	 * @runInSeparateProcess
	 * @preserveGlobalState disabled
	 */
	public function test_once_the_bridge_no_longer_carries_billing_the_store_plugin_takes_over(): void {
		require_once __DIR__ . '/stubs/wp-hooks.php';
		$GLOBALS['awstore_test_options'] = array( 'aware_wave_payments_enabled' => '1' );

		( new StoreModule() )->register();

		$hooks = $this->hooks();
		$this->assertFalse( StoreModule::legacyBridgeBillingLoaded() );
		$this->assertNotContains( 'admin_notices', $hooks );
		foreach ( array( 'admin_menu', PaymentSender::ACTION, 'woocommerce_payment_complete', 'woocommerce_order_status_refunded', 'woocommerce_subscription_status_cancelled' ) as $hook ) {
			$this->assertContains( $hook, $hooks );
		}
	}
}
