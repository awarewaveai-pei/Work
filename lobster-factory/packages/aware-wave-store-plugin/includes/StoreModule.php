<?php
/**
 * Wires ADR 017 4b-2 into WordPress on aware-wave.com. This plugin is installed only on AwareWave's own shop, so the
 * settings page is always there; the product fields and everything that acts on members or money (payment events,
 * email verification, the checkout gate, door buttons) register only while the switch is on. Rollback = switch off.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

use AwareWave\Store\Admin\SettingsPage;

final class StoreModule {

	/** wp-bridge <= 0.18.3 carried this same code; while it is still installed it owns the hooks. */
	const LEGACY_BRIDGE_BILLING = 'AwareWave\\WpBridge\\Billing\\BillingModule';

	/**
	 * Both copies registering = every payment queued twice and every note written twice. Runs on plugins_loaded, so the
	 * bridge's autoloader exists whatever order WordPress loaded the two plugins in.
	 */
	public static function legacyBridgeBillingLoaded(): bool {
		return class_exists( self::LEGACY_BRIDGE_BILLING );
	}

	public function register(): void {
		if ( self::legacyBridgeBillingLoaded() ) {
			add_action(
				'admin_notices',
				function () {
					if ( current_user_can( SettingsPage::CAP ) ) {
						echo '<div class="notice notice-warning"><p>AwareWave 商店外掛待命中：AwareWave WP Bridge 仍是 0.18.x，付款與會員由它處理。把 wp-bridge 升到 0.19.0 以上，這個外掛就會自動接手。</p></div>';
					}
				}
			);
			return;
		}
		( new SettingsPage() )->register();

		$settings = Settings::fromOptions();
		$shop     = new WooShop();
		$http     = new WpHttpClient();
		$queue    = new ActionSchedulerQueue( $shop );

		// The sender stays registered when off, so already-queued events are noted as "not sent" instead of
		// failing silently in Action Scheduler (PaymentSender::deliver returns 'disabled').
		add_action(
			PaymentSender::ACTION,
			function ( $job ) use ( $http, $queue, $shop ) {
				( new PaymentSender( $http, $queue, $shop ) )->deliver( (array) $job, Settings::fromOptions() );
			}
		);

		if ( ! $settings->enabled ) {
			return;
		}

		( new ProductFields() )->register();

		$events = new PaymentEvents( $shop, new WpMembers(), $queue, $settings->allowedGateways );
		// woocommerce_payment_complete fires only when a gateway calls payment_complete(); an admin marking an order paid,
		// or a gateway that sets the status itself, reaches only the status hooks. Same deterministic ids = the server
		// inbox absorbs the second firing.
		foreach ( array( 'woocommerce_payment_complete', 'woocommerce_order_status_processing', 'woocommerce_order_status_completed' ) as $hook ) {
			add_action(
				$hook,
				function ( $orderId ) use ( $events ) {
					$events->onPaymentComplete( (int) $orderId );
				}
			);
		}
		add_action(
			'woocommerce_subscription_renewal_payment_complete',
			function ( $subscription, $renewalOrder = null ) use ( $events ) {
				$events->onRenewalPaymentComplete( (int) $subscription->get_id(), is_object( $renewalOrder ) ? (int) $renewalOrder->get_id() : 0 );
			},
			10,
			2
		);
		add_action(
			'woocommerce_subscriptions_switched_item',
			function ( $subscription, $newItem ) use ( $events ) {
				$events->onSwitchedItem( (int) $subscription->get_id(), (int) $newItem->get_product_id(), (int) $newItem->get_id() );
			},
			10,
			2
		);
		// Full refund → events; a partial refund reaches onOrderRefunded only to leave the "record it by hand" note.
		foreach ( array( 'woocommerce_order_status_refunded', 'woocommerce_order_partially_refunded' ) as $hook ) {
			add_action(
				$hook,
				function ( $orderId ) use ( $events ) {
					$events->onOrderRefunded( (int) $orderId );
				}
			);
		}
		foreach ( array( 'cancelled', 'expired' ) as $status ) {
			add_action(
				'woocommerce_subscription_status_' . $status,
				function ( $subscription ) use ( $events, $status ) {
					$events->onSubscriptionEnded( (int) $subscription->get_id(), $status );
				}
			);
		}

		( new EmailVerification() )->register();
		( new GoogleSignup() )->register();
		( new WelcomeGift( $settings->welcomeProductId, $shop ) )->register();
		( new CheckoutGate( $shop, $settings ) )->register();
		( new MyAccountDoors( $settings, $shop, $http ) )->register();
	}
}
