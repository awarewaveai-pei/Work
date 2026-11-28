<?php
/**
 * Setting fluentform_keep_entries on: an accepted signup becomes a Fluent Forms entry (and the pending
 * request), a refused one does not, and erasing personal data removes the address's entries. The pipeline
 * follows fluentform 6.2.17 SubmissionHandlerService; WordPress, the tables and FluentCRM are stand-ins.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Daily\FluentFormsEntry;
use AwareWave\Oracle\Members\Privacy;
use PHPUnit\Framework\TestCase;

/**
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class FluentFormsKeepUnitTest extends TestCase {

	private static function wordpress(): void {
		// phpcs:disable Squiz.PHP.Eval.Discouraged -- stand-ins, in this test's own process.
		eval(
			'namespace AwareWave\Oracle\Daily {
				final class Crm {
					public static function available() { return true; }
					public static function findByEmail( $e ) { return null; }
					public static function upsertPending( $e ) { return array( "id" => 7, "email" => $e, "status" => "pending" ); }
				}
			}
			namespace FluentForm\App\Models {
				final class Form { public static function find( $id ) { return (object) array( "id" => (int) $id, "form_fields" => "" ); } }
			}
			namespace {
				define( "HOUR_IN_SECONDS", 3600 );
				define( "ARRAY_A", "ARRAY_A" );
				define( "AWORACLE_DATA_KEY", base64_encode( str_repeat( "k", 32 ) ) );
				class AwSent extends \Exception { public $status; }
				class WP_Error {
					private $c, $d;
					public function __construct( $c = "", $m = "", $d = array() ) { $this->c = $c; $this->d = $d; }
					public function get_error_code() { return $this->c; }
					public function get_error_data() { return $this->d; }
				}
				class AwDb {
					public $prefix = "wp_";
					public $pending = 0;
					public $entries = array();
					public function get_row() { return null; }
					public function prepare( $sql, ...$args ) { return array( $sql, $args ); }
					public function query( $q ) { $this->pending++; return 1; }
					public function esc_like( $s ) { return $s; }
					public function get_var( $q ) { return strpos( $q[0], "SHOW TABLES" ) === 0 && strpos( $q[1][0], "fluentform" ) !== false ? $q[1][0] : null; }
					public function get_col( $q ) { return array( 9 ); }
					public function get_results( $q ) { return array_values( $this->entries ); }
					public function delete( $table, $where ) {
						if ( $table === "wp_fluentform_submissions" ) { unset( $this->entries[ $where["id"] ] ); }
						return 1;
					}
				}
				function add_filter( $h, $cb, $p = 10, $a = 1 ) { $GLOBALS["aw_hooks"][ $h ][] = array( $cb, $a ); }
				function add_action( $h, $cb, $p = 10, $a = 1 ) { add_filter( $h, $cb, $p, $a ); }
				function apply_filters( $h, $v, ...$args ) {
					foreach ( $GLOBALS["aw_hooks"][ $h ] ?? array() as $c ) { $v = $c[0]( ...array_slice( array_merge( array( $v ), $args ), 0, $c[1] ) ); }
					return $v;
				}
				function do_action( $h, ...$args ) {
					foreach ( $GLOBALS["aw_hooks"][ $h ] ?? array() as $c ) { $c[0]( ...array_slice( $args, 0, $c[1] ) ); }
				}
				function wp_send_json( $body, $status ) { $e = new AwSent(); $e->status = $status; throw $e; }
				function wp_json_encode( $v, $f = 0 ) { return json_encode( $v, $f ); }
				function get_option( $n, $d = false ) { return $n === "aworacle_settings" ? array( "mailer" => "fluentcrm", "fluentform_id" => 9, "fluentform_keep_entries" => true ) : $d; }
				function update_option() {}
				function get_transient() { return false; }
				function set_transient() {}
				function delete_transient() {}
				function get_user_by() { return false; }
				function __( $t ) { return $t; }
				function esc_html( $t ) { return $t; }
				function esc_html__( $t ) { return $t; }
				function esc_url( $u ) { return $u; }
				function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
				function wp_get_current_user() { return null; }
				function current_time() { return "2026-11-29 00:00:00"; }
				function determine_locale() { return "zh_TW"; }
				function home_url( $p = "" ) { return "https://site.test" . $p; }
				function add_query_arg( $k, $v, $u ) { return $u . "?" . $k . "=" . $v; }
				function wp_mail() { return true; }
			}'
		);
		$GLOBALS['aw_hooks'] = array();
		$GLOBALS['wpdb']     = new \AwDb();
		( new FluentFormsEntry() )->register();
	}

	/** Fluent Forms' order: insert_response_data → before_insert_submission → insert. Returns the refusal status, 0 = inserted. */
	private static function submit( string $month ): int {
		$posted = array(
			'email'          => 'a@example.com',
			'calendar'       => 'solar',
			'birth_year'     => '1873',
			'birth_month'    => $month,
			'birth_day'      => '29',
			'birth_hour'     => '8',
			'birth_minute'   => '5',
			'gender'         => '女',
			'aw_place_label' => 'Canaryville',
			'aw_place_lat'   => '25.03',
			'aw_place_lon'   => '121.5',
			'aw_place_zone'  => 'Asia/Taipei',
			'aw_tz'          => 'Asia/Taipei',
			'aw_locale'      => 'zh-TW',
			'aw_turnstile'   => 'spent-token',
		);
		try {
			$data = apply_filters( 'fluentform/insert_response_data', $posted, 9, array() );
			do_action( 'fluentform/before_insert_submission', array(), $posted, (object) array( 'id' => 9, 'form_fields' => '' ) );
		} catch ( \AwSent $sent ) {
			return $sent->status;
		}
		$GLOBALS['wpdb']->entries[1] = array(
			'id'         => 1,
			'form_id'    => 9,
			'response'   => json_encode( $data ),
			'created_at' => '2026-11-29 00:00:00',
		);
		return 0;
	}

	public function testAcceptedSignupIsPendingAndOneEntry(): void {
		self::wordpress();

		$this->assertSame( 0, self::submit( '11' ) );

		$this->assertSame( 1, $GLOBALS['wpdb']->pending );
		$this->assertCount( 1, $GLOBALS['wpdb']->entries );
		$response = $GLOBALS['wpdb']->entries[1]['response'];
		$this->assertStringContainsString( '1873', $response );
		$this->assertStringNotContainsString( 'spent-token', $response );
	}

	public function testRefusedSignupLeavesNoEntry(): void {
		self::wordpress();

		$this->assertSame( 400, self::submit( '13' ) );

		$this->assertSame( array(), $GLOBALS['wpdb']->entries );
		$this->assertSame( 0, $GLOBALS['wpdb']->pending );
	}

	public function testErasingPersonalDataRemovesTheEntries(): void {
		self::wordpress();
		self::submit( '11' );

		$result = Privacy::erase( 'A@Example.com' );

		$this->assertSame( array(), $GLOBALS['wpdb']->entries, 'the eraser must remove the signup entries' );
		$this->assertTrue( $result['items_removed'] );
	}
}
