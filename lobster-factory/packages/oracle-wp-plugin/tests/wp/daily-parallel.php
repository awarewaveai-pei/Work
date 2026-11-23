<?php
/**
 * P3: two hourly runs at the same time send one letter per subscriber (the claim's unique key).
 * Same prerequisites as daily-check.php (fake inbox only). Three steps, the middle one twice in parallel:
 *   wp eval-file tests/wp/daily-parallel.php seed
 *   wp eval-file tests/wp/daily-parallel.php run & wp eval-file tests/wp/daily-parallel.php run & wait
 *   wp eval-file tests/wp/daily-parallel.php verify     (PASS/FAIL, exit 1 on FAIL; removes its contacts)
 *
 * @package AwareWave\Oracle\Tests
 */

defined( 'WP_CLI' ) || exit;

use AwareWave\Oracle\Daily\Runner;
use AwareWave\Oracle\Daily\Store;

const P3_PAR_N   = 20;
const P3_PAR_NOW = '2026-05-01 03:00'; // 11:00 Asia/Taipei

$step   = $args[0] ?? '';
$emails = array();
for ( $i = 0; $i < P3_PAR_N; $i++ ) {
	$emails[] = "par$i@p3.example.test";
}
$ids = function () use ( $emails ): array {
	return array_map( 'intval', \FluentCrm\App\Models\Subscriber::whereIn( 'email', $emails )->pluck( 'id' )->toArray() );
};

if ( $step === 'seed' ) {
	$birth = array( 'calendar' => 'solar', 'year' => 1985, 'month' => 2, 'day' => 3, 'hour' => 4, 'minute' => 5, 'gender' => '男', 'place' => array( 'label' => '', 'lat' => 25.03, 'lon' => 121.56, 'zone' => 'Asia/Taipei' ) );
	foreach ( $emails as $e ) {
		$c = FluentCrmApi( 'contacts' )->createOrUpdate( array( 'email' => $e, 'status' => 'pending' ) );
		$key   = \AwareWave\Oracle\Settings\Options::dataKey();
		$token = bin2hex( random_bytes( 16 ) );
		Store::savePending( (int) $c->id, 0, array( 'birth' => $birth, 'tz' => 'Asia/Taipei', 'locale' => 'en' ), $key, hash( 'sha256', $token ), 0 );
		Store::confirm( (int) $c->id, $token, $key ); // what the POST on the confirmation link does
		\AwareWave\Oracle\Daily\Crm::subscribe( (int) $c->id );
	}
	WP_CLI::log( 'seeded ' . count( $ids() ) );
	return;
}

if ( $step === 'run' ) {
	$at = ( new DateTimeImmutable( P3_PAR_NOW, new DateTimeZone( 'UTC' ) ) )->getTimestamp();
	WP_CLI::log( wp_json_encode( Runner::run( $at ) ) );
	return;
}

if ( $step === 'verify' ) {
	global $wpdb;
	$list = $ids();
	$in   = implode( ',', array_map( 'intval', $list ) );
	$rows = $in === '' ? array() : $wpdb->get_results( 'SELECT subscriber_id, COUNT(*) n, MAX(state) s FROM ' . Store::sent() . " WHERE local_date = '2026-05-01' AND subscriber_id IN ($in) GROUP BY subscriber_id", ARRAY_A ); // phpcs:ignore
	$queued = $in === '' ? 0 : (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}fc_campaign_emails e JOIN {$wpdb->prefix}fc_campaigns c ON c.id = e.campaign_id WHERE c.slug LIKE 'oracle-daily-%-2026-05-01' AND e.subscriber_id IN ($in)" ); // phpcs:ignore
	$ok1 = count( $rows ) === P3_PAR_N && count( array_filter( $rows, function ( $r ) { return (int) $r['n'] === 1 && $r['s'] === 'sent'; } ) ) === P3_PAR_N;
	$ok2 = $queued === P3_PAR_N;
	WP_CLI::log( ( $ok1 ? 'PASS' : 'FAIL' ) . ' parallel runs: one sent row per subscriber (' . count( $rows ) . ' rows)' );
	WP_CLI::log( ( $ok2 ? 'PASS' : 'FAIL' ) . " parallel runs: one FluentCRM email per subscriber ($queued)" );
	\FluentCrm\App\Services\Helper::deleteContacts( $list );
	if ( ! $ok1 || ! $ok2 ) {
		exit( 1 );
	}
	return;
}

WP_CLI::error( 'step: seed | run | verify' );
