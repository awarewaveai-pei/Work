<?php
/**
 * P4 acceptance on a real WordPress (same setup as daily-check.php: FluentCRM, FluentSMTP -> Mailpit at
 * http://mail:8025, engine at the server engine URL). Never run against a site that can send real mail.
 *   wp eval-file tests/wp/turnstile-cache-check.php
 * Tool-list cache follows the engine address (counted fetches); Turnstile with Cloudflare's published test keys
 * (always pass / always fail; calls Cloudflare's siteverify): a refused signup stores nothing and mails nothing.
 * Leaves the Turnstile keys unset. Exits 1 on any FAIL.
 *
 * @package AwareWave\Oracle\Tests
 */

defined( 'WP_CLI' ) || exit;

use AwareWave\Oracle\Engine\EngineClient;
use AwareWave\Oracle\Settings\Options;
use AwareWave\Oracle\Daily\Turnstile;

$failed = 0;
$check  = function ( string $name, bool $ok, string $detail = '' ) use ( &$failed ) {
	WP_CLI::log( ( $ok ? 'PASS ' : 'FAIL ' ) . $name . ( $ok ? '' : ' — ' . $detail ) );
	if ( ! $ok ) {
		++$failed;
	}
};
$patch = function ( string $k, $v ) {
	$s       = get_option( Options::OPTION, array() );
	$s[ $k ] = $v;
	update_option( Options::OPTION, $s ); // no settings form: same path as wp option patch
};

// ---- cache ----
$calls = 0;
add_filter(
	'pre_http_request',
	function ( $pre, $args, $url ) use ( &$calls ) {
		if ( strpos( $url, '/api/v1/systems' ) !== false ) {
			++$calls;
		}
		return $pre;
	},
	10,
	3
);
$good = Options::get()['server_engine_url'];
delete_transient( EngineClient::TOOLS_TRANSIENT );
$t1 = EngineClient::tools();
$check( 'first read fetches', $calls === 1 && count( $t1 ) > 0, "calls=$calls tools=" . count( $t1 ) );
EngineClient::tools();
$check( 'second read is cached', $calls === 1, "calls=$calls" );
$patch( 'server_engine_url', 'http://host.docker.internal:1' );
$t2 = EngineClient::tools();
$check( 'address changed: next read fetches again', $calls === 2 && $t2 === array(), "calls=$calls" );
$patch( 'server_engine_url', $good );
$t3 = EngineClient::tools();
$check( 'address back: fetches again (not the cached empty list of the other address)', $calls === 3 && $t3 === $t1, "calls=$calls" );
set_transient( EngineClient::TOOLS_TRANSIENT, array( 'ziwei' ), DAY_IN_SECONDS ); // pre-0.5.0 shape
EngineClient::tools();
$check( 'old-format cache entry is refetched', $calls === 4, "calls=$calls" );

// ---- Turnstile ----
global $wpdb;
$profiles = $wpdb->prefix . 'aworacle_daily_profiles';
$rows     = function () use ( $wpdb, $profiles ) {
	return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$profiles}" );
};
$mails = function () {
	$r = wp_remote_get( 'http://mail:8025/api/v1/messages?limit=1', array( 'timeout' => 10 ) );
	$j = json_decode( (string) wp_remote_retrieve_body( $r ), true );
	return (int) ( $j['messages_count'] ?? $j['total'] ?? -1 );
};
$flush = function () {
	shell_exec( 'wp eval ' . escapeshellarg( '\FluentCrm\App\Hooks\Handlers\Scheduler::process();' ) . ' --path=' . escapeshellarg( ABSPATH ) . ' 2>&1' );
};
$n       = 0;
$created = array();
$sub     = function ( ?string $token ) use ( &$n, &$created ) {
	++$n;
	delete_option( 'aworacle_daily_confirm_count' );
	$_SERVER['REMOTE_ADDR'] = '203.0.113.' . $n;
	delete_transient( 'aworacle_daily_ip_' . md5( $_SERVER['REMOTE_ADDR'] ) );
	$body = array(
		'email'  => 'p4-' . $n . '-' . wp_generate_password( 6, false ) . '@p4.example.test',
		'tz'     => 'Asia/Taipei',
		'locale' => 'en',
		'birth'  => array(
			'calendar' => 'solar', 'year' => 1990, 'month' => 5, 'day' => 17, 'hour' => 8, 'minute' => 30, 'gender' => '女',
			'place'    => array( 'label' => 'Taipei', 'lat' => 25.03, 'lon' => 121.56, 'zone' => 'Asia/Taipei' ),
		),
	);
	if ( $token !== null ) {
		$body['turnstile'] = $token;
	}
	$created[] = $body['email'];
	$req = new WP_REST_Request( 'POST', '/aworacle/v1/daily/subscribe' );
	$req->set_header( 'Content-Type', 'application/json' );
	$req->set_body( wp_json_encode( $body ) );
	return rest_do_request( $req )->get_status();
};
$attempt = function ( string $name, ?string $token, int $wantStatus, bool $wantCreated ) use ( $sub, $rows, $mails, $flush, $check ) {
	$r0 = $rows();
	$m0 = $mails();
	$st = $sub( $token );
	$flush();
	sleep( 1 );
	$created = $rows() > $r0;
	$mailed  = $mails() > $m0;
	$check( $name, $st === $wantStatus && $created === $wantCreated && $mailed === $wantCreated, "status=$st created=" . (int) $created . ' mailed=' . (int) $mailed );
};

$patch( 'turnstile_site_key', '' );
delete_option( Options::TURNSTILE_SECRET_OPTION );
$check( 'no keys: status off', Turnstile::status() === 'off' );
$attempt( 'no keys: form works as before (202, request stored, confirmation mailed)', null, 202, true );

$patch( 'turnstile_site_key', '1x00000000000000000000AA' );
$check( 'site key only: status partial (not enforced)', Turnstile::status() === 'partial' );

update_option( Options::TURNSTILE_SECRET_OPTION, '1x0000000000000000000000000000000AA', false );
$check( 'both keys: status on', Turnstile::status() === 'on' );
$check( 'secret option is not autoloaded', in_array( $wpdb->get_var( $wpdb->prepare( "SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", Options::TURNSTILE_SECRET_OPTION ) ), array( 'no', 'off' ), true ) );
$attempt( 'always-pass secret + dummy token: 202, stored, mailed', 'XXXX.DUMMY.TOKEN.XXXX', 202, true );
$attempt( 'always-pass secret, no token: 403, nothing stored, nothing mailed', null, 403, false );

update_option( Options::TURNSTILE_SECRET_OPTION, '2x0000000000000000000000000000000AA', false );
$attempt( 'always-fail secret: 403, nothing stored, nothing mailed', 'XXXX.DUMMY.TOKEN.XXXX', 403, false );

// Cloudflare unreachable = failure (timeout / network error path).
add_filter(
	'pre_http_request',
	function ( $pre, $args, $url ) {
		return strpos( $url, 'challenges.cloudflare.com' ) !== false ? new WP_Error( 'http_request_failed', 'timeout' ) : $pre;
	},
	20,
	3
);
update_option( Options::TURNSTILE_SECRET_OPTION, '1x0000000000000000000000000000000AA', false );
$attempt( 'Cloudflare unreachable: 403, nothing stored, nothing mailed', 'XXXX.DUMMY.TOKEN.XXXX', 403, false );

$patch( 'turnstile_site_key', '' );
delete_option( Options::TURNSTILE_SECRET_OPTION );
// Clean up: this script's contacts (FluentCRM deletion also removes their daily rows, Daily\Hooks).
foreach ( $created as $e ) {
	$c = \AwareWave\Oracle\Daily\Crm::findByEmail( $e );
	if ( $c ) {
		\FluentCrm\App\Services\Helper::deleteContacts( array( $c['id'] ) );
	}
}
$check( 'own contacts removed, no daily rows of theirs left', (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . \AwareWave\Oracle\Daily\Store::profiles() ) === 0 ); // phpcs:ignore
WP_CLI::log( $failed ? "FAILED $failed" : 'ALL PASS' );
exit( $failed ? 1 : 0 );
