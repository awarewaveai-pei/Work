<?php
/**
 * Plugin Name:       AwareWave WP Bridge
 * Plugin URI:        https://aware-wave.com
 * Description:       Ed25519-authenticated, self-healing control plane that lets an AI operate this site safely (signed requests, render-verify, auto-rollback).
 * Version:           0.18.0
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

define( 'AWBRIDGE_VERSION', '0.18.0' );
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

// Operator admin screen (status, one-click key generation, live self-test).
( new Admin\AdminPage() )->register();

// Register the Traditional-Chinese power-word list with Rank Math so CJK titles can score the SEO
// Title Readability "power word" point (Rank Math ships no zh power-word file). SSOT mirror of the
// content generator's CJK compliance block.
( new Content\RankMathPowerWords() )->register();

// Render a variable product's Colour attribute as clickable hex swatches on the storefront, driven by
// the `_awbridge_color_swatches` product meta the publish flow writes (label=>hex). A swatch click sets
// the hidden <select> + fires jQuery 'change', so WooCommerce performs its native per-variation image
// swap (each colour's mockup). No-op on products without the meta map or off the storefront.
( new Frontend\ColorSwatches() )->register();

// Product-editor UI to set the swatch hex map by hand (so a manually-built WooCommerce product gets
// colour swatches too — not only the one-click publish flow). Admin screens only; zero front-end cost.
( new Admin\ColorSwatchAdmin() )->register();

// Master colour palette (Products → 🎨 色票調色盤) — the operator-managed, provider-agnostic colour
// list the storefront falls back to (when a product has no per-product map) and the per-product box
// pre-fills from. The Printful one-click flow is untouched (it writes its own per-product Printful map).
( new Admin\SwatchPalette() )->register();

// STANDARD swatch config (how mature swatch plugins do it): a colour picker on each global product-
// attribute TERM (Products → Attributes → Color → term). Define a colour once on the term and EVERY
// variable product using that attribute renders swatches — no per-product setup. (0.17.0)
( new Admin\AttributeSwatchTerms() )->register();

// ADR 017 4b-2: WooCommerce / Subscriptions payments → signed events to app.aware-wave.com, member email
// verification before checkout, and My Account 「進入」 door buttons. One switch (AwareWave Bridge → 付款與會員),
// default OFF; product fields and the settings page are always present. (0.18.0)
( new Billing\BillingModule() )->register();

