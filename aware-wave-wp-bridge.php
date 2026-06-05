<?php
/**
 * Plugin Name:       AwareWave WP Bridge
 * Plugin URI:        https://aware-wave.com
 * Description:       Ed25519-authenticated, self-healing control plane that lets an AI operate this site safely (signed requests, render-verify, auto-rollback).
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            AwareWave
 * License:           Proprietary
 * Text Domain:       aware-wave-wp-bridge
 *
 * This is the WordPress entry point. The runnable plumbing lives here; the security + self-healing
 * logic is the WP-free, unit-tested core under includes/ (Auth / Http / Transaction / Validation).
 *
 * @package AwareWave\WpBridge
 */

namespace AwareWave\WpBridge;

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'AWBRIDGE_VERSION', '0.1.0' );
define( 'AWBRIDGE_DIR', plugin_dir_path( __FILE__ ) );
define( 'AWBRIDGE_REST_NAMESPACE', 'aware-wave-bridge/v1' );

/**
 * Minimal PSR-4 autoloader for AwareWave\WpBridge\* -> includes/. No composer dependency at runtime
 * (the same mapping the test bootstrap uses), so the plugin loads standalone on any WordPress.
 */
spl_autoload_register(
	function ( $class ) {
		$prefix = 'AwareWave\\WpBridge\\';
		if ( strpos( $class, $prefix ) !== 0 ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = AWBRIDGE_DIR . 'includes/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_file( $path ) ) {
			require $path;
		}
	}
);

// Create the key + nonce tables on activation (idempotent via dbDelta).
register_activation_hook( __FILE__, array( Plugin\Activation::class, 'run' ) );

// Register REST routes once the REST API is initialising.
add_action(
	'rest_api_init',
	function () {
		( new Http\RestController() )->register();
	}
);
