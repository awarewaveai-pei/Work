<?php
/**
 * Plugin Name:          AwareWave Store
 * Plugin URI:           https://aware-wave.com
 * Description:          AwareWave's own shop only (aware-wave.com): WooCommerce / Subscriptions payments become signed events to app.aware-wave.com, members confirm their email before checkout, and My Account gets the product 「進入」 buttons. Not for client sites.
 * Version:              1.1.0
 * Requires at least:    6.0
 * Requires PHP:         7.4
 * Requires Plugins:     woocommerce
 * WC requires at least: 8.0
 * Author:               AwareWave
 * License:              Proprietary
 * Text Domain:          aware-wave-store
 *
 * Split out of aware-wave-wp-bridge 0.18.x (ADR 017 4b-2): the bridge is the AI-to-WordPress channel every site
 * runs; this is AwareWave's business logic, installed on aware-wave.com alone. Stored names (options, meta, the
 * Action Scheduler hook, link parameters) are unchanged from the bridge, so the switch-over moves no data.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'AWSTORE_VERSION', '1.1.0' );
define( 'AWSTORE_DIR', plugin_dir_path( __FILE__ ) );

/** Minimal PSR-4 autoloader for AwareWave\Store\* -> includes/ (same mapping as the test bootstrap). */
spl_autoload_register(
	function ( $class ) {
		$prefix = 'AwareWave\\Store\\';
		if ( strpos( $class, $prefix ) !== 0 ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = AWSTORE_DIR . 'includes/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_file( $path ) ) {
			require $path;
		}
	}
);

// Orders are read and written only through wc_get_order() (WooShop), and the block checkout is gated (CheckoutGate).
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

// plugins_loaded: wp-bridge's autoloader is registered by then whichever plugin WordPress loaded first.
add_action(
	'plugins_loaded',
	function () {
		( new StoreModule() )->register();
	}
);
