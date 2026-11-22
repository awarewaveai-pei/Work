<?php
/**
 * Removes the plugin's options (settings, site key, pseudonym salt) and the tool-list cache — on every
 * site of a multisite network (the plugin may have been active on any of them). P1 has no tables; P2/P3
 * add their own cleanup to aworacle_uninstall_site().
 *
 * @package AwareWave\Oracle
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

function aworacle_uninstall_site(): void {
	delete_option( 'aworacle_settings' );
	delete_option( 'aworacle_site_keypair' );
	delete_option( 'aworacle_member_salt' );
	delete_transient( 'aworacle_tools' );
}

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
