<?php
/**
 * Removes the plugin's options (settings, site key, pseudonym salt, Turnstile secret), the tool-list cache and the member
 * tables (saved charts and persons), the daily-letter tables and schedules, and the ticket rate counters —
 * on every site of a multisite network (the plugin may have been active on any of them).
 * FluentCRM contacts and campaigns stay: they belong to FluentCRM.
 *
 * @package AwareWave\Oracle
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// The plugin is not loaded during uninstall: the tables come from Members\Store::KINDS and Daily\Store::TABLES.
require_once __DIR__ . '/includes/Members/Store.php';
require_once __DIR__ . '/includes/Daily/Store.php';
require_once __DIR__ . '/includes/Daily/Runner.php';
require_once __DIR__ . '/includes/Daily/Hooks.php';

function aworacle_uninstall_site(): void {
	delete_option( 'aworacle_settings' );
	delete_option( 'aworacle_site_keypair' );
	delete_option( 'aworacle_member_salt' );
	delete_option( 'aworacle_turnstile_secret' );
	delete_transient( 'aworacle_tools' ); // 0.4 and earlier
	delete_transient( 'aworacle_tools_v2' );
	delete_option( 'aworacle_daily_last_run' );
	delete_option( 'aworacle_daily_confirm_count' );
	\AwareWave\Oracle\Members\Store::drop();
}

delete_metadata( 'user', 0, 'aworacle_ticket_window', '', true );

if ( is_multisite() ) {
	$aworacle_page = 0;
	do {
		$aworacle_ids = get_sites(
			array(
				'fields' => 'ids',
				'number' => 100,
				'offset' => 100 * $aworacle_page++,
			)
		);
		foreach ( $aworacle_ids as $aworacle_id ) {
			switch_to_blog( (int) $aworacle_id );
			aworacle_uninstall_site();
			restore_current_blog();
		}
	} while ( count( $aworacle_ids ) === 100 );
} else {
	aworacle_uninstall_site();
}
