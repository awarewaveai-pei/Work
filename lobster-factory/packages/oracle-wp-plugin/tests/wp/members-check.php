<?php
/**
 * P2 acceptance on a real WordPress (ORACLE-WP-SPEC §3 P2′). Run with WP-CLI, plugin active and
 * AWORACLE_DATA_KEY set in wp-config.php:
 *   wp eval-file tests/wp/members-check.php seed     REST access rules, ownership, encryption round trip
 *   (then: wp db export - | grep for the canaries printed by seed → must find nothing)
 *   wp eval-file tests/wp/members-check.php finish   privacy export, privacy erase, user deletion
 * Prints PASS/FAIL per check; exits 1 on any FAIL. Creates and deletes its own users (aworacle-a/b/c).
 *
 * @package AwareWave\Oracle\Tests
 */

defined( 'WP_CLI' ) || exit;

use AwareWave\Oracle\Members\Store;

$phase  = $args[0] ?? 'seed';
$failed = 0;

$check = function ( string $name, bool $ok, string $detail = '' ) use ( &$failed ) {
	WP_CLI::log( ( $ok ? 'PASS ' : 'FAIL ' ) . $name . ( $ok || $detail === '' ? '' : ' — ' . $detail ) );
	if ( ! $ok ) {
		++$failed;
	}
};

$user = function ( string $login ): int {
	$u = get_user_by( 'login', $login );
	if ( $u ) {
		return (int) $u->ID;
	}
	return (int) wp_insert_user(
		array(
			'user_login' => $login,
			'user_email' => $login . '@example.test',
			'user_pass'  => wp_generate_password( 24 ),
			'role'       => 'subscriber',
		)
	);
};

/** @return array{0:int,1:mixed} */
$call = function ( string $method, string $path, int $userId, bool $nonce = true, ?array $body = null ): array {
	wp_set_current_user( $userId );
	$req = new WP_REST_Request( $method, '/aworacle/v1/' . $path );
	if ( $nonce && $userId > 0 ) {
		$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
	}
	if ( $body !== null ) {
		$req->set_header( 'Content-Type', 'application/json' );
		$req->set_body( wp_json_encode( $body ) );
	}
	$res = rest_do_request( $req );
	return array( $res->get_status(), $res->get_data() );
};

$rows = function ( int $userId ): int {
	global $wpdb;
	$n = 0;
	foreach ( array( 'charts', 'persons' ) as $kind ) {
		$n += (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . Store::table( $kind ) . ' WHERE user_id = %d', $userId ) ); // phpcs:ignore
	}
	return $n;
};

$birth = array(
	'calendar' => 'solar',
	'year'     => 1873,
	'month'    => 11,
	'day'      => 29,
	'hour'     => 8,
	'minute'   => 5,
	'gender'   => '女',
	'place'    => array(
		'label' => 'Canaryville',
		'lat'   => 25.03,
		'lon'   => 121.56,
		'zone'  => 'Asia/Taipei',
	),
);

$a = $user( 'aworacle-a' );
$b = $user( 'aworacle-b' );

if ( $phase === 'seed' ) {
	Store::deleteAllFor( $a );
	Store::deleteAllFor( $b );
	$check( 'tables exist (schema installed)', get_option( Store::SCHEMA_OPTION ) === Store::SCHEMA_VERSION );

	[ $s ] = $call( 'GET', 'charts', 0 );
	$check( 'logged out GET → 401', $s === 401, (string) $s );
	[ $s ] = $call( 'POST', 'persons', 0, true, array( 'name' => 'x', 'birth' => $birth ) );
	$check( 'logged out POST → 401', $s === 401, (string) $s );
	[ $s ] = $call( 'GET', 'charts', $a, false );
	$check( 'logged in, no nonce, GET → 401', $s === 401, (string) $s );
	[ $s ] = $call( 'POST', 'charts', $a, false, array( 'name' => 'x', 'birth' => $birth ) );
	$check( 'logged in, no nonce, POST → 401', $s === 401, (string) $s );
	$check( 'nothing stored by refused calls', $rows( $a ) === 0 );

	[ $s, $chart ] = $call( 'POST', 'charts', $a, true, array( 'name' => 'Zed-Canary-Chart', 'birth' => $birth ) );
	$check( 'A creates a chart → 201', $s === 201 && ! empty( $chart['id'] ), (string) $s );
	[ $s, $person ] = $call( 'POST', 'persons', $a, true, array( 'name' => 'Zed-Canary-Person', 'birth' => $birth ) );
	$check( 'A creates a person → 201', $s === 201 && ! empty( $person['id'] ), (string) $s );
	[ $s, $bad ] = $call( 'POST', 'persons', $a, true, array( 'name' => 'x', 'birth' => array( 'year' => '1873' ) + $birth ) );
	$check( 'invalid body → 400 with field', $s === 400 && in_array( 'birth.year', $bad['data']['fields'] ?? array(), true ), (string) $s );

	$cid = (int) ( $chart['id'] ?? 0 );
	$pid = (int) ( $person['id'] ?? 0 );
	[ $s ] = $call( 'GET', 'charts/' . $cid, $b );
	$check( 'B reads A\'s chart → 404', $s === 404, (string) $s );
	[ $s ] = $call( 'PUT', 'persons/' . $pid, $b, true, array( 'name' => 'B-was-here', 'birth' => $birth ) );
	$check( 'B updates A\'s person → 404', $s === 404, (string) $s );
	[ $s ] = $call( 'DELETE', 'charts/' . $cid, $b );
	$check( 'B deletes A\'s chart → 404', $s === 404, (string) $s );
	[ $s, $list ] = $call( 'GET', 'persons', $b );
	$check( 'B\'s list is empty', $s === 200 && $list['items'] === array(), (string) $s );

	[ $s, $mine ] = $call( 'GET', 'persons/' . $pid, $a );
	$check( 'A\'s person unchanged after B\'s attempts', $s === 200 && ( $mine['name'] ?? '' ) === 'Zed-Canary-Person' && ( $mine['birth']['year'] ?? 0 ) === 1873, wp_json_encode( $mine ) );
	[ $s ] = $call( 'GET', 'charts/' . $cid, $a );
	$check( 'A\'s chart still there after B\'s delete', $s === 200, (string) $s );
	[ $s, $upd ] = $call( 'PUT', 'charts/' . $cid, $a, true, array( 'name' => 'Zed-Canary-Chart', 'birth' => array( 'hour' => 9 ) + $birth ) );
	$check( 'A updates own chart → 200', $s === 200 && ( $upd['birth']['hour'] ?? 0 ) === 9, (string) $s );

	global $wpdb;
	$raw = (string) $wpdb->get_var( $wpdb->prepare( 'SELECT data FROM ' . Store::table( 'persons' ) . ' WHERE id = %d', $pid ) ); // phpcs:ignore
	$check( 'stored blob is ciphertext', strpos( $raw, 'v1.' ) === 0 && strpos( $raw, 'Canary' ) === false && strpos( $raw, '1873' ) === false, substr( $raw, 0, 60 ) );

	WP_CLI::log( 'CANARIES Zed-Canary 1873 Canaryville' );
} elseif ( $phase === 'finish' ) {
	$email = 'aworacle-a@example.test';
	$exporters = apply_filters( 'wp_privacy_personal_data_exporters', array() );
	$export    = isset( $exporters['aware-wave-oracle'] ) ? call_user_func( $exporters['aware-wave-oracle']['callback'], $email, 1 ) : array( 'data' => array() );
	$groups    = array_values( array_unique( array_column( $export['data'], 'group_id' ) ) );
	sort( $groups );
	$check( 'privacy export has both groups', $groups === array( 'aworacle-charts', 'aworacle-persons' ), wp_json_encode( $groups ) );
	$text = wp_json_encode( $export['data'], JSON_UNESCAPED_UNICODE );
	$check( 'privacy export is readable (decrypted)', strpos( $text, 'Zed-Canary-Person' ) !== false && strpos( $text, '1873-11-29' ) !== false, $text );

	$erasers = apply_filters( 'wp_privacy_personal_data_erasers', array() );
	$erase   = isset( $erasers['aware-wave-oracle'] ) ? call_user_func( $erasers['aware-wave-oracle']['callback'], $email, 1 ) : array();
	$check( 'privacy erase reports removal', ! empty( $erase['items_removed'] ) );
	$check( 'after erase: no rows of A in both tables', $rows( $a ) === 0, (string) $rows( $a ) );

	$c = $user( 'aworacle-c' );
	$call( 'POST', 'charts', $c, true, array( 'name' => 'C', 'birth' => $birth ) );
	$call( 'POST', 'persons', $c, true, array( 'name' => 'C2', 'birth' => $birth ) );
	$check( 'C has rows before deletion', $rows( $c ) === 2, (string) $rows( $c ) );
	require_once ABSPATH . 'wp-admin/includes/user.php';
	wp_delete_user( $c );
	$check( 'deleting the user removes C\'s rows', $rows( $c ) === 0, (string) $rows( $c ) );

	$d = $user( 'aworacle-d' );
	$call( 'POST', 'persons', $d, true, array( 'name' => 'D', 'birth' => $birth ) );
	remove_action( 'delete_user', array( \AwareWave\Oracle\Members\Privacy::class, 'onDeleteUser' ) );
	wp_delete_user( $d ); // as if the plugin were inactive at that moment
	$check( 'orphan left while the hook was off', $rows( $d ) === 1, (string) $rows( $d ) );
	Store::purgeOrphans();
	$check( 'purgeOrphans removes rows of deleted members', $rows( $d ) === 0, (string) $rows( $d ) );
	$check( 'daily purge scheduled', (bool) wp_next_scheduled( Store::PURGE_HOOK ) );
	add_action( 'delete_user', array( \AwareWave\Oracle\Members\Privacy::class, 'onDeleteUser' ) );

	wp_delete_user( $a );
	wp_delete_user( $b );
}

if ( $failed > 0 ) {
	WP_CLI::halt( 1 );
}
