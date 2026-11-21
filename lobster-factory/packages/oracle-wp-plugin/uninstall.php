<?php
/**
 * Removes the plugin's options (settings, site key, pseudonym salt) and the tool-list cache.
 * P1 has no tables; P2/P3 add their own cleanup here.
 *
 * @package AwareWave\Oracle
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'aworacle_settings' );
delete_option( 'aworacle_site_keypair' );
delete_option( 'aworacle_member_salt' );
delete_transient( 'aworacle_tools' );
