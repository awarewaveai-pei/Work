<?php
/**
 * REST daily/subscribe with only what the visitor has to fill (e-mail, birth date and time, gender) and the
 * form's defaults for the rest: accepted and stored as a pending request. Store, Crm and WordPress are stubbed.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Daily\Rest;
use AwareWave\Oracle\Places\Birthplace;
use PHPUnit\Framework\TestCase;

final class SignupUnitTest extends TestCase {

	/**
	 * @runInSeparateProcess
	 * @preserveGlobalState disabled
	 */
	public function testOnlyEmailBirthAndGenderIsStoredAsPending(): void {
		// phpcs:disable Squiz.PHP.Eval.Discouraged -- stand-ins, in this test's own process.
		eval(
			'namespace AwareWave\Oracle\Daily {
				final class Runner { public static function offReason() { return ""; } }
				final class Crm {
					public static function findByEmail( $e ) { return null; }
					public static function upsertPending( $e ) { return array( "id" => 7, "email" => $e, "status" => "pending" ); }
				}
				final class Turnstile { public static function status() { return "off"; } }
				final class Store {
					public static function savePending( $id, $user, $req ) { $GLOBALS["aw_pending"] = array( $id, $req ); return true; }
				}
				final class Confirm {
					public static function takeDailySlot() { return true; }
					public static function mail() {}
				}
			}
			namespace AwareWave\Oracle\Settings {
				final class Options { public static function dataKey() { return "k"; } }
			}
			namespace {
				define( "HOUR_IN_SECONDS", 3600 );
				class WP_REST_Request { private $b; public function __construct( $b ) { $this->b = $b; } public function get_json_params() { return $this->b; } }
				class WP_REST_Response { public $data; public $status; public function __construct( $d, $s ) { $this->data = $d; $this->status = $s; } }
				class WP_Error { public function __construct( ...$a ) {} }
				function __( $t ) { return $t; }
				function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
				function get_transient( $k ) { return false; }
				function set_transient() {}
				function wp_get_current_user() { return null; }
			}'
		);
		// The body assets/daily.js posts: calendar, leap, true solar, day divide, time zone and place untouched.
		$body = array(
			'email'  => 'a@example.com',
			'tz'     => 'Asia/Taipei',
			'locale' => 'zh-TW',
			'birth'  => array(
				'calendar'    => 'solar',
				'year'        => 1990,
				'month'       => 5,
				'day'         => 17,
				'hour'        => 8,
				'minute'      => 30,
				'isLeapMonth' => false,
				'gender'      => '女',
				'place'       => Birthplace::fallback( 'zh-TW' ),
				'trueSolar'   => false,
				'dayDivide'   => 'current',
			),
		);

		$res = ( new Rest() )->subscribe( new \WP_REST_Request( json_decode( json_encode( $body ), true ) ) );

		$this->assertInstanceOf( \WP_REST_Response::class, $res );
		$this->assertSame( 202, $res->status );
		$this->assertSame( 7, $GLOBALS['aw_pending'][0] );
		$this->assertSame( '台北', $GLOBALS['aw_pending'][1]['birth']['place']['label'] );
		$this->assertSame( 121.5, $GLOBALS['aw_pending'][1]['birth']['place']['lon'] );
	}
}
