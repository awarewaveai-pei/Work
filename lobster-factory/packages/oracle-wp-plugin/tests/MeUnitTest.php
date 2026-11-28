<?php
/**
 * "My birth data" (Members\Me): one mark per member, only on their own chart, saved rows untouched, and the
 * one-click subscription ending in a pending request. Real Me, Store, Vault and Daily signup path; WordPress,
 * the tables and FluentCRM are stand-ins.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Crypto\Vault;
use AwareWave\Oracle\Members\Me;
use PHPUnit\Framework\TestCase;

/**
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class MeUnitTest extends TestCase {

	private const KEY = 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk';

	private static function wordpress(): void {
		// phpcs:disable Squiz.PHP.Eval.Discouraged -- stand-ins, in this test's own process.
		eval(
			'namespace AwareWave\Oracle\Daily {
				final class Crm {
					public static function available() { return true; }
					public static function findByEmail( $e ) { return null; }
					public static function upsertPending( $e ) { $GLOBALS["aw_contact"] = $e; return array( "id" => 7, "email" => $e, "status" => "pending" ); }
				}
			}
			namespace {
				define( "HOUR_IN_SECONDS", 3600 );
				define( "ARRAY_A", "ARRAY_A" );
				define( "AWORACLE_DATA_KEY", base64_encode( str_repeat( "k", 32 ) ) );
				class WP_Error { public function __construct( ...$a ) {} }
				class WP_REST_Request { private $b; public function __construct( $b = array() ) { $this->b = $b; } public function get_json_params() { return $this->b; } }
				class WP_REST_Response { public $data; public $status; public function __construct( $d, $s ) { $this->data = $d; $this->status = $s; } public function header() {} }
				class AwDb {
					public $prefix = "wp_";
					public $charts = array();
					public $writes = array();
					public function prepare( $sql, ...$args ) { return array( $sql, $args ); }
					public function get_row( $q, $o = null ) {
						list( $sql, $a ) = $q;
						if ( strpos( $sql, "aworacle_charts" ) === false ) { return null; }
						$row = $this->charts[ $a[0] ] ?? null;
						return $row && $row["user_id"] === $a[1] ? $row : null;
					}
					public function query( $q ) { $this->writes[] = $q[0]; return 1; }
				}
				function get_user_option( $n, $u ) { return $GLOBALS["aw_meta"][ $u ][ $n ] ?? false; }
				function update_user_option( $u, $n, $v ) { $GLOBALS["aw_meta"][ $u ][ $n ] = $v; }
				function delete_user_option( $u, $n ) { unset( $GLOBALS["aw_meta"][ $u ][ $n ] ); }
				function wp_get_current_user() { return (object) array( "ID" => 1, "user_email" => "Member@example.com" ); }
				function get_current_user_id() { return 1; }
				function get_option( $n, $d = false ) { return $n === "aworacle_settings" ? array( "mailer" => "fluentcrm" ) : $d; }
				function update_option() {}
				function get_transient() { return false; }
				function set_transient() {}
				function delete_transient() {}
				function apply_filters( $h, $v ) { return $v; }
				function __( $t ) { return $t; }
				function esc_html__( $t ) { return $t; }
				function esc_html( $t ) { return $t; }
				function esc_url( $u ) { return $u; }
				function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
				function current_time() { return "2026-11-29 00:00:00"; }
				function determine_locale() { return "en_US"; }
				function home_url( $p = "" ) { return "https://site.test" . $p; }
				function add_query_arg( $k, $v, $u ) { return $u . "?" . $k . "=" . $v; }
				function wp_mail() { return true; }
			}'
		);
		$GLOBALS['aw_meta'] = array();
		$GLOBALS['wpdb']    = new \AwDb();
	}

	/** A row exactly as 0.5.3 stored it: encrypted blob, no mark column or field. */
	private static function chart( int $id, int $userId, int $year ): void {
		$data = array(
			'name'  => 'chart ' . $id,
			'birth' => array(
				'calendar'    => 'solar',
				'year'        => $year,
				'month'       => 11,
				'day'         => 29,
				'hour'        => 8,
				'minute'      => 5,
				'gender'      => '女',
				'place'       => array( 'label' => 'Canaryville', 'lat' => 25.03, 'lon' => 121.5, 'zone' => 'Asia/Taipei' ),
				'trueSolar'   => false,
				'dayDivide'   => 'current',
				'isLeapMonth' => false,
			),
		);
		$GLOBALS['wpdb']->charts[ $id ] = array(
			'id'         => $id,
			'user_id'    => $userId,
			'data'       => Vault::seal( $data, self::KEY, 'charts:' . $userId ),
			'created_at' => '2026-11-01 00:00:00',
			'updated_at' => '2026-11-01 00:00:00',
		);
	}

	public function testAMemberHasAtMostOneMarkedChart(): void {
		self::wordpress();
		self::chart( 11, 1, 1873 );
		self::chart( 12, 1, 1990 );

		$this->assertTrue( Me::set( 1, 11, self::KEY ) );
		$this->assertTrue( Me::set( 1, 12, self::KEY ) );

		$this->assertSame( array( 'aworacle_self_chart' => 12 ), $GLOBALS['aw_meta'][1] );
		$this->assertSame( 1990, Me::chart( 1, self::KEY )['birth']['year'] );
	}

	public function testAnotherMembersChartCannotBeMarkedOrRead(): void {
		self::wordpress();
		self::chart( 21, 2, 1873 );

		$this->assertFalse( Me::set( 1, 21, self::KEY ), 'ownership guard' );
		$this->assertSame( 0, Me::id( 1 ) );
		// Even a mark pointing at another member's row (tampered or stale) reads nothing.
		$GLOBALS['aw_meta'][1]['aworacle_self_chart'] = 21;
		$this->assertNull( Me::chart( 1, self::KEY ) );
	}

	public function testChartsSavedBeforeTheUpgradeStayAsTheyWere(): void {
		self::wordpress();
		self::chart( 31, 1, 1873 );
		$before = $GLOBALS['wpdb']->charts;

		$this->assertNull( Me::chart( 1, self::KEY ), 'an existing member starts with no mark' );
		$this->assertTrue( Me::set( 1, 31, self::KEY ) );

		$this->assertSame( $before, $GLOBALS['wpdb']->charts );
		$this->assertSame( array(), $GLOBALS['wpdb']->writes );
		$this->assertSame( 'chart 31', Me::chart( 1, self::KEY )['name'] );
		$this->assertSame( 'Canaryville', Me::chart( 1, self::KEY )['birth']['place']['label'] );
	}

	public function testOneClickSubscriptionEndsInAPendingRequest(): void {
		self::wordpress();
		self::chart( 41, 1, 1873 );
		Me::set( 1, 41, self::KEY );

		$res = ( new Me() )->subscribe( new \WP_REST_Request( array( 'tz' => 'Europe/London', 'locale' => 'en' ) ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $res );
		$this->assertSame( 202, $res->status );
		$this->assertSame( 'member@example.com', $GLOBALS['aw_contact'] );
		$this->assertCount( 1, $GLOBALS['wpdb']->writes );
		$this->assertStringContainsString( 'aworacle_daily_profiles', $GLOBALS['wpdb']->writes[0] );
	}
}
