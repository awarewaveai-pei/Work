<?php
/**
 * P3 acceptance on a real WordPress (ORACLE-WP-SPEC §3 P3′). Needs: plugin active, FluentCRM (free) active,
 * AWORACLE_DATA_KEY and AWORACLE_RESEND_WEBHOOK_SECRET in wp-config.php, a site key whose public half is in
 * the local engine's ORACLE_SITES, the engine at the "server engine URL", and a FAKE inbox: FluentSMTP pointed
 * at Mailpit (MAILPIT below). Never run against a site that can send real mail.
 *   wp eval-file tests/wp/daily-check.php
 * Prints PASS/FAIL per check; exits 1 on any FAIL. Creates its own contacts (*@p3.example.test) and users
 * (aworacle-p3-*) and removes them at the end.
 *
 * @package AwareWave\Oracle\Tests
 */

defined( 'WP_CLI' ) || exit;

use AwareWave\Oracle\Daily\Crm;
use AwareWave\Oracle\Daily\Runner;
use AwareWave\Oracle\Daily\Store;
use AwareWave\Oracle\Daily\Signup;
use AwareWave\Oracle\Settings\Options;

const MAILPIT = 'http://mail:8025/api/v1';

$failed = 0;
$check  = function ( string $name, bool $ok, string $detail = '' ) use ( &$failed ) {
	WP_CLI::log( ( $ok ? 'PASS ' : 'FAIL ' ) . $name . ( $ok || $detail === '' ? '' : ' — ' . $detail ) );
	if ( ! $ok ) {
		++$failed;
	}
};

$mail = function ( string $method, string $path = '/messages' ) {
	$r = wp_remote_request( MAILPIT . $path, array( 'method' => $method, 'timeout' => 10 ) );
	return is_wp_error( $r ) ? null : json_decode( (string) wp_remote_retrieve_body( $r ), true );
};
$inbox = function () use ( $mail ): array {
	$j = $mail( 'GET', '/messages?limit=500' );
	return is_array( $j ) ? (array) ( $j['messages'] ?? array() ) : array();
};
$to = function ( string $addr ) use ( $inbox ): array {
	return array_values(
		array_filter(
			$inbox(),
			function ( $m ) use ( $addr ) {
				return strtolower( (string) ( $m['To'][0]['Address'] ?? '' ) ) === $addr;
			}
		)
	);
};

// FluentCRM sends one email per PHP request and queues the rest for its every-minute task
// (Mailer\Handler::isSystemOk: did_action('fluent_crm/sending_emails_starting')). Run that task in a fresh
// process, as the site's scheduler would, before looking at the inbox.
$flush = function () {
	for ( $i = 0; $i < 3; $i++ ) {
		shell_exec( 'wp eval ' . escapeshellarg( '\FluentCrm\App\Hooks\Handlers\Scheduler::process();' ) . ' --path=' . escapeshellarg( ABSPATH ) . ' 2>&1' );
	}
};

$reset = function () use ( $flush, $mail ) {
	$flush();
	$mail( 'DELETE' );
};
$run = uniqid( '', false ); // webhook ids unique per run of this script (the events table outlives it)

$ip   = 0;
$call = function ( string $method, string $route, ?array $body = null, array $headers = array(), int $user = 0, bool $nonce = false, ?string $raw = null ) use ( &$ip ) {
	wp_set_current_user( $user );
	$_SERVER['REMOTE_ADDR'] = '198.51.100.' . ( ++$ip % 250 );
	delete_transient( 'aworacle_daily_ip_' . md5( $_SERVER['REMOTE_ADDR'] ) ); // per-address limit is tested on its own below
	$req = new WP_REST_Request( $method, $route );
	foreach ( $headers as $k => $v ) {
		$req->set_header( $k, $v );
	}
	if ( $nonce && $user > 0 ) {
		$req->set_header( 'X-WP-Nonce', wp_create_nonce( 'wp_rest' ) );
	}
	if ( $body !== null || $raw !== null ) {
		$req->set_header( 'Content-Type', 'application/json' );
		$req->set_body( $raw ?? wp_json_encode( $body ) );
	}
	$res = rest_do_request( $req );
	return array( $res->get_status(), $res->get_data() );
};

$birth = array(
	'calendar' => 'solar',
	'year'     => 1990,
	'month'    => 5,
	'day'      => 17,
	'hour'     => 8,
	'minute'   => 30,
	'gender'   => '女',
	'place'    => array( 'label' => 'Taipei', 'lat' => 25.03, 'lon' => 121.56, 'zone' => 'Asia/Taipei' ),
);
$subscribe = function ( string $email, string $tz, string $locale = 'en' ) use ( $call, $birth ) {
	return $call( 'POST', '/aworacle/v1/daily/subscribe', array( 'email' => $email, 'tz' => $tz, 'locale' => $locale, 'birth' => $birth ) );
};
$contact = function ( string $email ) {
	return Crm::findByEmail( $email );
};
// "<id>.<token>" from the newest confirmation mail to $email (Mailpit lists newest first), or ''.
$link = function ( string $email ) use ( $to, $mail ): string {
	$m    = $to( $email )[0] ?? null;
	$html = $m ? (string) ( $mail( 'GET', '/message/' . $m['ID'] )['HTML'] ?? '' ) : '';
	return preg_match( '/aworacle_daily_confirm=([0-9]+\.[A-Za-z0-9_-]{43})/', $html, $mm ) ? $mm[1] : '';
};
// Open a confirmation link on this site over real HTTP: GET = the page a mail scanner sees, POST = the button.
$open = function ( string $value, string $method = 'POST' ): array {
	$host = wp_parse_url( home_url(), PHP_URL_HOST ) . ':' . wp_parse_url( home_url(), PHP_URL_PORT );
	$r    = wp_remote_request( 'http://wp/?aworacle_daily_confirm=' . $value, array( 'method' => $method, 'headers' => array( 'Host' => $host ), 'redirection' => 0, 'timeout' => 20 ) );
	return array( (int) wp_remote_retrieve_response_code( $r ), (string) wp_remote_retrieve_body( $r ) );
};
$sentRows = function ( int $id ): array {
	global $wpdb;
	return $wpdb->get_results( $wpdb->prepare( 'SELECT local_date, state FROM ' . Store::sent() . ' WHERE subscriber_id = %d', $id ), ARRAY_A ); // phpcs:ignore
};
$at = function ( string $utc ): int {
	return ( new DateTimeImmutable( $utc, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
};
$setOpt = function ( string $k, $v ) {
	$s       = get_option( Options::OPTION );
	$s[ $k ] = $v;
	update_option( Options::OPTION, $s );
};

$reset();
$emails = array();

// ---- signup block visibility (§2-9) --------------------------------------------------------------------
$setOpt( 'mailer', 'none' );
$check( 'mailer=none: no signup block', Signup::render() === '' && do_shortcode( '[aw_oracle_daily]' ) === '' );
[ $st ] = $subscribe( 'x@p3.example.test', 'Asia/Taipei' );
$check( 'mailer=none: subscribe 503', $st === 503, (string) $st );
$setOpt( 'mailer', 'fluentcrm' );
$check( 'mailer=fluentcrm: block rendered', strpos( Signup::render(), 'class="aworacle-daily"' ) !== false );

// ---- signup → pending → double opt-in → confirmed ---------------------------------------------------------
$zones = array(
	'taipei'  => 'Asia/Taipei',
	'london'  => 'Europe/London',
	'la'      => 'America/Los_Angeles',
	'kolkata' => 'Asia/Kolkata',
);
$ids = array();
foreach ( $zones as $name => $tz ) {
	$email = $name . '@p3.example.test';
	$emails[] = $email;
	[ $st ] = $subscribe( $email, $tz, $name === 'taipei' ? 'zh-TW' : 'en' );
	$c      = $contact( $email );
	$ids[ $name ] = $c ? $c['id'] : 0;
	$check( "subscribe $name: 202, contact pending", $st === 202 && $c && $c['status'] === 'pending', $st . ' ' . wp_json_encode( $c ) );
}
$check( 'confirmation mail with a one-time link sent (not FluentCRM double opt-in)', $link( 'taipei@p3.example.test' ) !== '' && count( $to( 'taipei@p3.example.test' ) ) === 1 );
[ $st, $body ] = $call( 'POST', '/aworacle/v1/daily/subscribe', array( 'email' => 'bad', 'tz' => 'Mars/Base', 'birth' => array() ) );
$check( 'invalid signup → 400 with fields', $st === 400 && in_array( 'email', $body['data']['fields'] ?? array(), true ) && in_array( 'tz', $body['data']['fields'] ?? array(), true ) );
$row = Store::get( $ids['taipei'] );
$check( 'pending profile: birth only as ciphertext', $row && $row['data'] === null && strpos( (string) $row['pending_data'], 'v1.' ) === 0 && strpos( (string) $row['pending_data'], '1990' ) === false );

// Unconfirmed: never picked (invariant 1).
$r = Runner::run( $at( '2026-11-23 12:00' ) );
$check( 'unconfirmed subscribers are not picked', $r['picked'] === 0, wp_json_encode( $r ) );

// FluentCRM's own double opt-in confirms the contact, not this request: it must not activate anything.
$sx = \FluentCrm\App\Models\Subscriber::find( $ids['taipei'] );
do_action( 'fluent_crm/subscriber_confirmed_via_double_optin', $sx );
$check( 'FluentCRM double opt-in event does not activate a request', Store::get( $ids['taipei'] )['status'] === Store::PENDING );
foreach ( $zones as $name => $tz ) {
	[ $st ] = $open( $link( $name . '@p3.example.test' ) );
	$check( "confirm $name by POST: 200", $st === 200, (string) $st );
}
$row = Store::get( $ids['london'] );
$check( 'confirmed → profile confirmed, tz kept, contact subscribed', $row && $row['status'] === Store::CONFIRMED && $row['tz'] === 'Europe/London' && $row['pending_data'] === null && $contact( 'london@p3.example.test' )['status'] === 'subscribed' );

// A second request for the same address replaces the first link; GET shows what is confirmed and changes nothing.
global $wpdb;
$reset();
$emails[] = 'swap@p3.example.test';
$subscribe( 'swap@p3.example.test', 'Asia/Taipei' );
$first = $link( 'swap@p3.example.test' );
$sid   = $contact( 'swap@p3.example.test' )['id'];
$wpdb->query( $wpdb->prepare( 'UPDATE ' . Store::profiles() . ' SET pending_at = %s WHERE subscriber_id = %d', gmdate( 'Y-m-d H:i:s', time() - 3600 ), $sid ) ); // phpcs:ignore -- past the 10-minute throttle
$subscribe( 'swap@p3.example.test', 'America/New_York' );
$second = $link( 'swap@p3.example.test' );
[ $st ] = $open( $first );
$check( 'replaced request: the old link no longer confirms', $first !== '' && $first !== $second && $st === 410 && Store::get( $sid )['status'] === Store::PENDING, (string) $st );
[ $st, $page ] = $open( $second, 'GET' );
$check( 'GET shows the request being confirmed and does not confirm', $st === 200 && strpos( $page, 'America/New_York' ) !== false && Store::get( $sid )['status'] === Store::PENDING, (string) $st );
[ $st ] = $open( $second );
$check( 'POST confirms exactly the request shown', $st === 200 && Store::get( $sid )['tz'] === 'America/New_York' );

global $wpdb;
// ---- four zones: first run after 07:00 local picks each once (2026-03-29 = London DST start) ----------------
$reset();
// Expected: which (zone, local date) each hourly run sends. London and LA are already past 07:00 on 03-28 at
// the first run; 03-29 is the London DST day (01:00 GMT → 02:00 BST).
$runs = array(
	'2026-03-28 22:00' => array( 'london 2026-03-28', 'la 2026-03-28' ), // 22:00 GMT, 15:00 PDT; Taipei 06:00, Kolkata 03:30
	'2026-03-28 23:00' => array( 'taipei 2026-03-29' ),                  // 07:00 Taipei
	'2026-03-29 02:00' => array( 'kolkata 2026-03-29' ),                 // 07:30 Kolkata
	'2026-03-29 05:00' => array(),                                       // 06:00 BST London
	'2026-03-29 06:00' => array( 'london 2026-03-29' ),                  // 07:00 BST London
	'2026-03-29 07:00' => array(),                                       // rerun: nobody twice
	'2026-03-29 14:00' => array( 'la 2026-03-29' ),                      // 07:00 PDT LA
	'2026-03-29 15:00' => array(),                                       // rerun
);
$seen = array();
$snap = function () use ( $zones, $ids, $sentRows ): array {
	$out = array();
	foreach ( $zones as $name => $tz ) {
		foreach ( $sentRows( $ids[ $name ] ) as $r ) {
			$out[] = $name . ' ' . $r['local_date'] . ( $r['state'] === 'sent' ? '' : ' ' . $r['state'] );
		}
	}
	return $out;
};
$got = array();
foreach ( $runs as $t => $expect ) {
	Runner::run( $at( $t ) );
	$now      = $snap();
	$got[ $t ] = array_values( array_diff( $now, $seen ) );
	$seen     = $now;
	sort( $got[ $t ] );
	sort( $expect );
	$check( "run $t UTC sends " . ( $expect ? implode( ', ', $expect ) : 'nobody' ), $got[ $t ] === $expect, wp_json_encode( $got[ $t ] ) );
}
$flush();
foreach ( array( 'taipei' => 1, 'kolkata' => 1, 'london' => 2, 'la' => 2 ) as $name => $n ) {
	$check(
		"$name: $n letter(s) in the inbox, one per local date",
		count( $to( $name . '@p3.example.test' ) ) === $n,
		wp_json_encode(
			array_map(
				function ( $m ) {
					return ( $m['To'][0]['Address'] ?? '?' ) . ' / ' . $m['Subject'];
				},
				$inbox()
			),
			JSON_UNESCAPED_UNICODE
		)
	);
}
global $wpdb;
$slugs = array();
foreach ( array( 'london 2026-03-28', 'la 2026-03-28', 'taipei 2026-03-29', 'kolkata 2026-03-29', 'london 2026-03-29', 'la 2026-03-29' ) as $nd ) {
	list( $n, $d ) = explode( ' ', $nd );
	$slugs[]      = 'oracle-daily-' . $ids[ $n ] . '-' . $d;
}
$titles = $wpdb->get_col( "SELECT title FROM {$wpdb->prefix}fc_campaigns WHERE type = 'custom_email_campaign' AND slug IN ('" . implode( "','", array_map( 'esc_sql', $slugs ) ) . "')" ); // phpcs:ignore
$check( 'FluentCRM campaign titles carry oracle-daily', count( $titles ) === 6 && count( preg_grep( '/^oracle-daily 2026-03-2[89]$/', $titles ) ) === 6, wp_json_encode( $titles ) );

// Letter content: zh-TW and en, List-Unsubscribe header.
foreach ( array( 'taipei' => '每日運勢', 'london' => 'daily fortune' ) as $name => $word ) {
	$m   = $to( $name . '@p3.example.test' )[0] ?? null;
	$msg = $m ? $mail( 'GET', '/message/' . $m['ID'] ) : null;
	$hdr = $m ? $mail( 'GET', '/message/' . $m['ID'] . '/headers' ) : null;
	$check( "$name letter: subject in its language", $m && stripos( (string) $m['Subject'], $word ) !== false, (string) ( $m['Subject'] ?? '' ) );
	$check( "$name letter: has scores and List-Unsubscribe", $msg && strpos( (string) $msg['HTML'], '★' ) !== false && ! empty( $hdr['List-Unsubscribe'] ), wp_json_encode( $hdr['List-Unsubscribe'] ?? null ) );
	file_put_contents( '/tmp/p3-letter-' . $name . '.html', (string) ( $msg['HTML'] ?? '' ) );
	file_put_contents( '/tmp/p3-letter-' . $name . '.headers.json', wp_json_encode( $hdr, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ) );
}

// ---- stalled scheduler: no back-fill -------------------------------------------------------------------
$r = Runner::run( $at( '2026-04-02 03:00' ) ); // 11:00 Taipei 04-02; days 03-30 … 04-01 missed
$t = array_column( $sentRows( $ids['taipei'] ), 'local_date' );
sort( $t );
$check( 'stalled scheduler: only today is sent, no back-fill', $t === array( '2026-03-29', '2026-04-02' ), wp_json_encode( $t ) );

// ---- engine error: nothing sent, claim released, retried later ---------------------------------------------
$reset();
$goodUrl = Options::get()['server_engine_url'];
$setOpt( 'server_engine_url', 'http://host.docker.internal:1' );
$r = Runner::run( $at( '2026-04-03 03:00' ) );
$check( 'engine down: nothing sent, every claim released', $r['sent'] === 0 && $r['released'] === $r['picked'] && count( $inbox() ) === 0 && ! in_array( '2026-04-03', array_column( $sentRows( $ids['taipei'] ), 'local_date' ), true ), wp_json_encode( $r ) );
$setOpt( 'server_engine_url', $goodUrl );
$r = Runner::run( $at( '2026-04-03 04:00' ) );
$flush();
$check( 'engine back: same day retried and sent once', in_array( '2026-04-03', array_column( $sentRows( $ids['taipei'] ), 'local_date' ), true ) && count( $to( 'taipei@p3.example.test' ) ) === 1, wp_json_encode( $r ) );

// ---- unsubscribed: never picked again ----------------------------------------------------------------------
\FluentCrm\App\Models\Subscriber::find( $ids['la'] )->updateStatus( 'unsubscribed' );
$check( 'unsubscribe deletes the daily profile, keeps the send history', Store::get( $ids['la'] ) === null && count( $sentRows( $ids['la'] ) ) > 0 );
$reset();
$r = Runner::run( $at( '2026-04-04 16:00' ) ); // 09:00 PDT
$flush();
$check( 'unsubscribed is not picked', ! in_array( '2026-04-04', array_column( $sentRows( $ids['la'] ), 'local_date' ), true ) && count( $to( 'la@p3.example.test' ) ) === 0 );
// Re-subscribing the same local day that already had a letter does not bring a second one (invariant 2).
$subscribe( 'la@p3.example.test', 'America/Los_Angeles' );
$open( $link( 'la@p3.example.test' ) );
$reset();
$r = Runner::run( $at( '2026-04-03 05:00' ) ); // 22:00 PDT on 04-02, a day LA already received
$flush();
$check( 're-subscribed the same day: no second letter for that day', Store::get( $ids['la'] )['status'] === Store::CONFIRMED && count( array_keys( array_column( $sentRows( $ids['la'] ), 'local_date' ), '2026-04-02', true ) ) === 1 && count( $to( 'la@p3.example.test' ) ) === 0, wp_json_encode( $sentRows( $ids['la'] ) ) );

// ---- Resend webhook ----------------------------------------------------------------------------------------
$secret = Options::webhookSecret();
$hook   = function ( string $type, string $email, string $id, ?string $secretOverride = null, string $bounce = 'Permanent' ) use ( $call, $secret ) {
	$body = wp_json_encode( array( 'type' => $type, 'created_at' => gmdate( 'c' ), 'data' => array( 'email_id' => 'e_' . $id, 'to' => array( $email ), 'bounce' => array( 'type' => $bounce, 'subType' => 'General' ) ) ) );
	$ts   = (string) time();
	$key  = base64_decode( substr( $secretOverride ?? $secret, 6 ) );
	$sig  = 'v1,' . base64_encode( hash_hmac( 'sha256', $id . '.' . $ts . '.' . $body, $key, true ) );
	return $call( 'POST', '/aworacle/v1/daily/resend-webhook', null, array( 'svix-id' => $id, 'svix-timestamp' => $ts, 'svix-signature' => $sig ), 0, false, $body );
};
$before = wp_json_encode( array( $contact( 'london@p3.example.test' ), Store::get( $ids['london'] ) ) );
[ $st ] = $hook( 'email.bounced', 'london@p3.example.test', 'msg_bad1_' . $run, 'whsec_' . base64_encode( str_repeat( 'z', 24 ) ) );
$check( 'webhook with a wrong signature: 401', $st === 401, (string) $st );
$check( 'webhook with a wrong signature: nothing changed', wp_json_encode( array( $contact( 'london@p3.example.test' ), Store::get( $ids['london'] ) ) ) === $before );
[ $st ] = $hook( 'email.bounced', 'london@p3.example.test', 'msg_ok1_' . $run );
$check( 'signed email.bounced: 200, contact bounced, profile gone', $st === 200 && $contact( 'london@p3.example.test' )['status'] === 'bounced' && Store::get( $ids['london'] ) === null, (string) $st );
[ $st, $b ] = $hook( 'email.bounced', 'london@p3.example.test', 'msg_ok1_' . $run );
$check( 'same webhook delivered again: not handled twice', $st === 200 && ! empty( $b['duplicate'] ), wp_json_encode( $b ) );
[ $st, $b ] = $hook( 'email.bounced', 'kolkata@p3.example.test', 'msg_tr_' . $run, null, 'Transient' );
$check( 'transient bounce (full mailbox): acknowledged, contact stays subscribed', $st === 200 && ! empty( $b['ignored'] ) && $contact( 'kolkata@p3.example.test' )['status'] === 'subscribed' && Store::get( $ids['kolkata'] ) !== null );
[ $st ] = $hook( 'email.complained', 'kolkata@p3.example.test', 'msg_ok2_' . $run );
$check( 'signed email.complained: contact complained, profile gone', $st === 200 && $contact( 'kolkata@p3.example.test' )['status'] === 'complained' && Store::get( $ids['kolkata'] ) === null );
$reset();
$r = Runner::run( $at( '2026-04-05 10:00' ) );
$flush();
$check( 'bounced / complained are not picked', count( $to( 'london@p3.example.test' ) ) + count( $to( 'kolkata@p3.example.test' ) ) === 0 );
[ $st ] = $subscribe( 'london@p3.example.test', 'Europe/London' );
$check( 'bounced address signing up again: 202 but no mail, no profile', $st === 202 && Store::get( $ids['london'] ) === null && count( $to( 'london@p3.example.test' ) ) === 0 );

// ---- already-subscribed contact: plugin's own confirmation link (POST only) ---------------------------------
$reset();
$email    = 'member@p3.example.test';
$emails[] = $email;
FluentCrmApi( 'contacts' )->createOrUpdate( array( 'email' => $email, 'status' => 'subscribed' ) );
[ $st ] = $subscribe( $email, 'Asia/Taipei' );
$cid    = $contact( $email )['id'];
$flush();
$m      = $to( $email )[0] ?? null;
$html   = $m ? (string) $mail( 'GET', '/message/' . $m['ID'] )['HTML'] : '';
preg_match( '/aworacle_daily_confirm=([0-9]+\.[A-Za-z0-9_-]{43})/', $html, $mm );
$check( 'subscribed contact: own confirmation mail with link', $st === 202 && ! empty( $mm[1] ), $st . ' ' . substr( wp_strip_all_tags( $html ), 0, 120 ) );
$url  = 'http://wp/?aworacle_daily_confirm=' . ( $mm[1] ?? 'x' );
$host = array( 'Host' => wp_parse_url( home_url(), PHP_URL_HOST ) . ':' . wp_parse_url( home_url(), PHP_URL_PORT ) );
wp_remote_get( $url, array( 'headers' => $host, 'redirection' => 0 ) );
$check( 'confirmation link GET (mail scanner) does not confirm', Store::get( $cid )['status'] === Store::PENDING );
$r = wp_remote_post( $url, array( 'headers' => $host, 'redirection' => 0 ) );
$check( 'confirmation POST confirms', Store::get( $cid )['status'] === Store::CONFIRMED, (string) wp_remote_retrieve_response_code( $r ) );
$r = wp_remote_post( $url, array( 'headers' => $host, 'redirection' => 0 ) );
$check( 'confirmation link works once', (int) wp_remote_retrieve_response_code( $r ) === 410 );

// A second request for a confirmed address does not change the active letter until confirmed.
$activeBefore = Store::get( $ids['taipei'] )['data'];
$subscribe( 'taipei@p3.example.test', 'America/New_York' );
$row = Store::get( $ids['taipei'] );
$check( 'new request for a confirmed address leaves the active letter alone', $row['status'] === Store::CONFIRMED && $row['tz'] === 'Asia/Taipei' && $row['data'] === $activeBefore && $row['pending_data'] !== null );

// Site-wide daily cap on confirmation mails: answer the same, send nothing.
$reset();
update_option( 'aworacle_daily_confirm_count', array( 'day' => gmdate( 'Y-m-d' ), 'count' => 30 ), false );
$emails[] = 'cap@p3.example.test';
[ $st ] = $subscribe( 'cap@p3.example.test', 'UTC' );
$check( 'confirmation-mail cap reached: 202, no mail', $st === 202 && count( $to( 'cap@p3.example.test' ) ) === 0 );
delete_option( 'aworacle_daily_confirm_count' );

// Monthly cleanup deletes this plugin's old campaigns in batches until done, and only those.
foreach ( range( 1, 5 ) as $i ) {
	\FluentCrm\App\Models\CustomEmailCampaign::create( array( 'title' => 'x', 'slug' => 'oracle-daily-cleanup-' . $run . '-' . $i, 'status' => 'published', 'email_subject' => 's', 'email_body' => 'b', 'created_at' => '2020-01-01 00:00:00' ) );
}
\FluentCrm\App\Models\CustomEmailCampaign::create( array( 'title' => 'other', 'slug' => 'someone-else-' . $run, 'status' => 'published', 'email_subject' => 's', 'email_body' => 'b', 'created_at' => '2020-01-01 00:00:00' ) );
$left  = function () use ( $wpdb, $run ): int {
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}fc_campaigns WHERE slug LIKE %s", 'oracle-daily-cleanup-' . $run . '-%' ) ); // phpcs:ignore
};
$part  = Crm::deleteOldCampaigns( 30, 0, 2 );
$whole = Crm::deleteOldCampaigns( 30, 20, 2 );
$other = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}fc_campaigns WHERE slug = %s", 'someone-else-' . $run ) ); // phpcs:ignore
$check( 'campaign cleanup: stops at the time limit and says so, then finishes every batch; others kept', $part === array( 2, false ) && $whole[1] === true && $left() === 0 && $other === 1, wp_json_encode( array( $part, $whole, $left(), $other ) ) );

// Rate limit: 6th signup from one address in an hour.
$_SERVER['REMOTE_ADDR'] = '203.0.113.9';
delete_transient( 'aworacle_daily_ip_' . md5( '203.0.113.9' ) );
$codes = array();
for ( $i = 0; $i < 6; $i++ ) {
	wp_set_current_user( 0 );
	$req = new WP_REST_Request( 'POST', '/aworacle/v1/daily/subscribe' );
	$req->set_header( 'Content-Type', 'application/json' );
	$req->set_body( wp_json_encode( array( 'email' => "rate$i@p3.example.test", 'tz' => 'UTC', 'birth' => $birth ) ) );
	$codes[]  = rest_do_request( $req )->get_status();
	$emails[] = "rate$i@p3.example.test";
}
$check( 'six signups from one address in an hour: the sixth is 429', $codes === array( 202, 202, 202, 202, 202, 429 ), wp_json_encode( $codes ) );

// ---- privacy: export, erase, member deletion --------------------------------------------------------------
$uid = (int) wp_insert_user( array( 'user_login' => 'aworacle-p3-a', 'user_email' => 'p3member@p3.example.test', 'user_pass' => wp_generate_password( 24 ) ) );
$emails[] = 'p3member@p3.example.test';
[ $st ] = $call( 'POST', '/aworacle/v1/daily/subscribe', array( 'email' => 'p3member@p3.example.test', 'tz' => 'Asia/Taipei', 'locale' => 'en', 'birth' => $birth ), array(), $uid, true );
$mid = $contact( 'p3member@p3.example.test' )['id'];
$check( 'signup while logged in links the member', $st === 202 && (int) Store::get( $mid )['user_id'] === $uid );
$exp = \AwareWave\Oracle\Members\Privacy::export( 'taipei@p3.example.test' );
$txt = wp_json_encode( $exp, JSON_UNESCAPED_UNICODE );
$check( 'privacy export includes the daily profile (decrypted)', strpos( $txt, 'aworacle-daily' ) !== false && strpos( $txt, '1990-05-17' ) !== false && strpos( $txt, 'Asia\/Taipei' ) !== false, $txt );
$er = \AwareWave\Oracle\Members\Privacy::erase( 'taipei@p3.example.test' );
$check( 'privacy erase deletes the daily profile and its send records', $er['items_removed'] && Store::get( $ids['taipei'] ) === null && $sentRows( $ids['taipei'] ) === array() );
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $uid );
$check( 'deleting the member deletes the linked daily profile', Store::get( $mid ) === null );

// ---- member ticket (§2-7) ----------------------------------------------------------------------------------
$ua = (int) wp_insert_user( array( 'user_login' => 'aworacle-p3-t1', 'user_email' => 't1@p3.example.test', 'user_pass' => wp_generate_password( 24 ) ) );
$ub = (int) wp_insert_user( array( 'user_login' => 'aworacle-p3-t2', 'user_email' => 't2@p3.example.test', 'user_pass' => wp_generate_password( 24 ) ) );
delete_user_meta( $ua, 'aworacle_ticket_window' );
[ $st ] = $call( 'POST', '/aworacle/v1/ticket' );
$check( 'ticket: not logged in → 401', $st === 401, (string) $st );
[ $st ] = $call( 'POST', '/aworacle/v1/ticket', null, array(), $ua, false );
$check( 'ticket: logged in without nonce → 401', $st === 401, (string) $st );
$member = function ( array $b ): string {
	$raw = base64_decode( strtr( (string) ( $b['ticket'] ?? '' ), '-_', '+/' ) );
	return (string) ( json_decode( (string) $raw, true )['member'] ?? '' );
};
[ $st1, $t1 ] = $call( 'POST', '/aworacle/v1/ticket', null, array(), $ua, true );
[ $st2, $t2 ] = $call( 'POST', '/aworacle/v1/ticket', null, array(), $ua, true );
[ $st3, $t3 ] = $call( 'POST', '/aworacle/v1/ticket', null, array(), $ub, true );
$check( 'ticket: same member → same pseudonym, different tickets', $st1 === 200 && $member( $t1 ) !== '' && $member( $t1 ) === $member( $t2 ) && $t1['ticket'] !== $t2['ticket'] );
$check( 'ticket: other member → other pseudonym', $st3 === 200 && $member( $t3 ) !== $member( $t1 ) );
$check( 'ticket: pseudonym shows no id or e-mail', ! preg_match( '/^' . $ua . '$|@/', $member( $t1 ) ) && strlen( $member( $t1 ) ) === 64 );
$interpret = function ( array $t ) {
	$r = wp_remote_post(
		Options::get()['server_engine_url'] . '/api/interpret',
		array(
			'timeout' => 30,
			'headers' => array(
				'Content-Type'                 => 'application/json',
				'X-AwareWave-Oracle-Ticket'    => $t['ticket'],
				'X-AwareWave-Oracle-Signature' => $t['signature'],
			),
			// No context: the engine answers 400 after the ticket passed, without calling the AI.
			'body'    => '{}',
		)
	);
	return array( (int) wp_remote_retrieve_response_code( $r ), (string) wp_remote_retrieve_body( $r ) );
};
[ $c1, $b1 ] = $interpret( $t1 );
$check( 'engine /api/interpret accepts the ticket (400 = got past the ticket to the body check)', $c1 === 400 && strpos( $b1, 'ticket' ) === false && strpos( $b1, 'signature' ) === false, $c1 . ' ' . $b1 );
[ $c2, $b2 ] = $interpret( $t1 );
$check( 'same ticket a second time is refused', $c2 === 401 && strpos( $b2, 'replayed_request' ) !== false, $c2 . ' ' . $b2 );
$codes = array();
for ( $i = 0; $i < 30; $i++ ) {
	$codes[] = $call( 'POST', '/aworacle/v1/ticket', null, array(), $ub, true )[0];
}
$check( 'ticket rate limit: the 31st in ten minutes is 429', count( array_keys( $codes, 200, true ) ) === 29 && end( $codes ) === 429, wp_json_encode( array_count_values( $codes ) ) );
wp_delete_user( $ua );
wp_delete_user( $ub );

// ---- clean up ----------------------------------------------------------------------------------------------
foreach ( array_unique( $emails ) as $e ) {
	$c = $contact( $e );
	if ( $c ) {
		\FluentCrm\App\Services\Helper::deleteContacts( array( $c['id'] ) );
	}
}
$check( 'contacts deleted → no daily rows left', (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . Store::profiles() ) === 0 ); // phpcs:ignore
wp_set_current_user( 0 );

WP_CLI::log( $failed ? "FAILED: $failed" : 'ALL PASS' );
if ( $failed ) {
	exit( 1 );
}
