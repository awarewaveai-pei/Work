<?php
/**
 * The Fluent Forms front of the daily-letter signup. The pipeline below calls the registered hooks in the
 * order of fluentform 6.2.17 SubmissionHandlerService (insert_response_data → before_insert_submission →
 * insert); whatever is still running after that action gets "inserted". The real Rest, Store and Vault run;
 * WordPress, the database and FluentCRM are stand-ins.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Crypto\Vault;
use AwareWave\Oracle\Daily\FluentFormsEntry;
use PHPUnit\Framework\TestCase;

/**
 * @runTestsInSeparateProcesses
 * @preserveGlobalState disabled
 */
final class FluentFormsUnitTest extends TestCase {

	private const FORM_ID = 9;

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
				class AwSent extends \Exception { public $body; public $status; }
				class WP_Error {
					private $c, $d;
					public function __construct( $c = "", $m = "", $d = array() ) { $this->c = $c; $this->d = $d; }
					public function get_error_code() { return $this->c; }
					public function get_error_data() { return $this->d; }
				}
				class AwDb {
					public $prefix = "wp_";
					public $writes = array();
					public function get_row() { return null; }
					public function prepare( $sql, ...$args ) { return array( $sql, $args ); }
					public function query( $q ) { $this->writes[] = $q; return 1; }
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
				function wp_send_json( $body, $status ) { $e = new AwSent(); $e->body = $body; $e->status = $status; throw $e; }
				function get_option( $n, $d = false ) { return $n === "aworacle_settings" ? array( "mailer" => "fluentcrm", "fluentform_id" => 9 ) : $d; }
				function update_option() {}
				function get_transient() { return false; }
				function set_transient() {}
				function delete_transient() {}
				function __( $t ) { return $t; }
				function esc_html( $t ) { return $t; }
				function esc_html__( $t ) { return $t; }
				function esc_url( $u ) { return $u; }
				function is_email( $e ) { return (bool) filter_var( $e, FILTER_VALIDATE_EMAIL ); }
				function wp_get_current_user() { return null; }
				function current_time() { return "2026-11-27 00:00:00"; }
				function determine_locale() { return "zh_TW"; }
				function home_url( $p = "" ) { return "https://site.test" . $p; }
				function add_query_arg( $k, $v, $u ) { return $u . "?" . $k . "=" . $v; }
				function wp_mail() { return true; }
			}'
		);
		$GLOBALS['aw_hooks'] = array();
		$GLOBALS['wpdb']     = new \AwDb();
	}

	/** @return array{0:array<int,mixed>,1:\AwSent|null} what Fluent Forms stored, what was answered */
	private static function submit( array $posted ): array {
		( new FluentFormsEntry() )->register();
		$form    = (object) array( 'id' => self::FORM_ID, 'form_fields' => '' );
		$entries = array();
		try {
			$data = apply_filters( 'fluentform/insert_response_data', $posted, self::FORM_ID, array() );
			do_action( 'fluentform/before_insert_submission', array( 'response' => json_encode( $data ) ), $posted, $form );
			$entries[] = $data; // Submission::insertGetId
		} catch ( \AwSent $sent ) {
			return array( $entries, $sent );
		}
		return array( $entries, null );
	}

	private static function posted(): array {
		return array(
			'email'          => 'a@example.com',
			'calendar'       => 'solar',
			'birth_year'     => '1873',
			'birth_month'    => '11',
			'birth_day'      => '29',
			'birth_hour'     => '8',
			'birth_minute'   => '5',
			'gender'         => '女',
			// As Fluent Forms posts checkboxes nobody ticked.
			'leap_month'     => array( '' ),
			'true_solar'     => array( '' ),
			'aw_place_label' => 'Canaryville',
			'aw_place_lat'   => '25.03',
			'aw_place_lon'   => '121.5',
			'aw_place_zone'  => 'Asia/Taipei',
			'aw_tz'          => 'Asia/Taipei',
			'aw_locale'      => 'zh-TW',
			'aw_turnstile'   => '',
		);
	}

	public function testValidSubmissionIsStoredSealedAndNeverAsAnEntry(): void {
		self::wordpress();

		list( $entries, $sent ) = self::submit( self::posted() );

		$this->assertSame( array(), $entries, 'Fluent Forms must not insert anything' );
		$this->assertSame( 200, $sent->status );
		$this->assertTrue( $sent->body['success'] );
		$this->assertCount( 1, $GLOBALS['wpdb']->writes );
		list( $sql, $args ) = $GLOBALS['wpdb']->writes[0];
		$this->assertStringContainsString( 'aworacle_daily_profiles', $sql );
		$this->assertStringNotContainsString( 'Canaryville', json_encode( $args ) );
		$this->assertStringNotContainsString( '1873', json_encode( $args ) );
		$stored = Vault::open( $args[3], str_repeat( 'k', 32 ), 'daily-pending:7' );
		$this->assertSame( 1873, $stored['birth']['year'] );
		$this->assertSame( 'Canaryville', $stored['birth']['place']['label'] );
		$this->assertFalse( $stored['birth']['trueSolar'] );
	}

	public function testInvalidSubmissionShowsFormErrorsAndStoresNothing(): void {
		self::wordpress();

		list( $entries, $sent ) = self::submit( array_merge( self::posted(), array( 'birth_month' => '13' ) ) );

		$this->assertSame( array(), $entries );
		$this->assertSame( array(), $GLOBALS['wpdb']->writes );
		$this->assertSame( 400, $sent->status );
		$this->assertArrayNotHasKey( 'success', $sent->body );
		$this->assertArrayHasKey( 'birth_month', $sent->body['errors'] );
		$this->assertStringContainsString( 'You are not subscribed yet.', $sent->body['errors']['aworacle'][0] );
	}
}
