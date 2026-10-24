<?php
/**
 * Wires ADR 017 4b-2 into WordPress. Product fields and the settings page are always present; everything that
 * acts on members or money (payment events, the sender, email verification, the checkout gate, door buttons)
 * registers only while the switch is on. Rollback = switch off.
 *
 * @package AwareWave\WpBridge\Billing
 */

namespace AwareWave\WpBridge\Billing;

use AwareWave\WpBridge\Admin\BillingSettingsPage;

final class BillingModule {

	public function register(): void {
		( new ProductFields() )->register();
		( new BillingSettingsPage() )->register();

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

		$events = new PaymentEvents( $shop, new WpMembers(), $queue );
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
			function ( $subscription ) use ( $events ) {
				$events->onRenewalPaymentComplete( (int) $subscription->get_id() );
			}
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
		( new CheckoutGate( $shop ) )->register();
		( new MyAccountDoors( $settings, $shop, $http ) )->register();
	}
}
