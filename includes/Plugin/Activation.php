<?php
/**
 * Activation — creates the bridge's two tables when the plugin is activated.
 *
 * Uses dbDelta (idempotent: safe to run on every activation/upgrade). The DDL is sourced from the
 * store classes' tableSchema() methods so there is ONE source of truth for each schema.
 *
 * @package AwareWave\WpBridge\Plugin
 */

namespace AwareWave\WpBridge\Plugin;

use AwareWave\WpBridge\Auth\WpdbKeyStore;
use AwareWave\WpBridge\Auth\WpdbNonceStore;

final class Activation {

	public static function run(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$collate = $wpdb->get_charset_collate();

		dbDelta( WpdbKeyStore::tableSchema( $wpdb->prefix, $collate ) );
		dbDelta( WpdbNonceStore::tableSchema( $wpdb->prefix, $collate ) );
	}
}
