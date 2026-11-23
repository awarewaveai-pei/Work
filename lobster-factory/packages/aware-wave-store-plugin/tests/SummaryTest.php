<?php
/**
 * My Account summary (blueprint §2A.4): the signed read, its 60 s cache, what each refusal draws, and that a pressed key
 * must be one the summary lists.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\MyAccountDoors;
use AwareWave\Store\PaymentSender;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use AwareWave\Store\Summary;
use AwareWave\Store\SummaryCache;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class FakeSummaryCache implements SummaryCache {
	/** @var array<int,array> */
	public $rows = array();
	/** @var list<int> */
	public $ttls = array();

	public function get( int $userId ): ?array {
		return $this->rows[ $userId ] ?? null;
	}

	public function set( int $userId, array $summary, int $ttl ): void {
		$this->rows[ $userId ] = $summary;
		$this->ttls[]          = $ttl;
	}

	public function forget( int $userId ): void {
		unset( $this->rows[ $userId ] );
	}
}

final class SummaryTest extends TestCase {

	const SECRET = 'awarewave-test-vector-secret-0123456789abcdef';

	private function settings(): Settings {
		return new Settings( true, 'https://app.aware-wave.com', self::SECRET, self::SECRET );
	}

	private function ok(): string {
		return (string) json_encode(
			array(
				'ok'         => true,
				'unit'       => array( 'name' => 'Soulful <b>' ),
				'wallet'     => array( 'balance' => 1240, 'frozen' => false ),
				'products'   => array(
					array( 'key' => 'content', 'name' => '內容行銷', 'right' => array( 'kind' => 'contract', 'label' => '方案內 9', 'counts' => array() ), 'can_enter' => true, 'url' => 'https://content.aware-wave.com/' ),
					array( 'key' => 'video', 'name' => '影片製作', 'right' => array( 'kind' => 'none', 'label' => '未開通', 'counts' => array() ), 'can_enter' => false ),
				),
				'fetched_at' => '2026-11-23T00:00:00Z',
			)
		);
	}

	private function summary( FakeHttp $http, ?FakeSummaryCache $cache = null ): Summary {
		return new Summary(
			$this->settings(),
			$http,
			$cache ?? new FakeSummaryCache(),
			function () {
				return 1000;
			},
			function () {
				return 'nonce0123456789abcdef';
			}
		);
	}

	public function test_a_success_is_signed_like_a_handoff_cached_60_seconds_and_lists_held_and_unheld(): void {
		$http  = new FakeHttp( 200, $this->ok() );
		$cache = new FakeSummaryCache();
		$out   = $this->summary( $http, $cache )->fetch( 7 );

		$this->assertTrue( $out['ok'] );
		$req = $http->requests[0];
		$this->assertSame( 'https://app.aware-wave.com/api/auth/wp-summary', $req['url'] );
		$this->assertSame( 2, $req['timeout'] );
		$this->assertSame( '{"wp_user_id":7,"ts":1000,"nonce":"nonce0123456789abcdef"}', $req['body'], 'no product_key: that is a wp-handoff body' );
		$this->assertSame( Signature::sign( $req['body'], self::SECRET ), $req['headers'][ Signature::HANDOFF_HEADER ] );
		$this->assertSame( array( 60 ), $cache->ttls );
		$this->assertSame( array( 'content' => '內容行銷' ), Summary::held( $out ), 'held = can_enter only' );
		$this->assertSame( '未開通', $out['data']['products'][1]['label'] );
	}

	public function test_a_cache_hit_does_not_call_the_app_again_and_forget_clears_it(): void {
		$http  = new FakeHttp( 200, $this->ok() );
		$cache = new FakeSummaryCache();
		$s     = $this->summary( $http, $cache );
		$s->fetch( 7 );
		$s->fetch( 7 );
		$this->assertCount( 1, $http->requests );
		$s->forget( 7 );
		$s->fetch( 7 );
		$this->assertCount( 2, $http->requests );
	}

	public function test_each_refusal_draws_what_the_route_table_says_and_never_caches(): void {
		$cases = array(
			array( 404, 'not_a_member', Summary::UNLINKED ),
			array( 403, 'email_unverified', Summary::UNVERIFIED ),
			array( 404, 'source_disabled', Summary::HIDDEN ),
			array( 403, 'site_disabled', Summary::HIDDEN ),
			array( 403, 'brand_unit_unsupported', Summary::UNLINKED ),
			array( 401, 'invalid_signature', Summary::FALLBACK ),
			array( 503, 'unavailable', Summary::FALLBACK ),
			array( 503, 'not_a_member', Summary::FALLBACK ),
			array( 418, 'something_new', Summary::FALLBACK ),
		);
		foreach ( $cases as $c ) {
			$cache = new FakeSummaryCache();
			$out   = $this->summary( new FakeHttp( $c[0], '{"ok":false,"error":"' . $c[1] . '"}' ), $cache )->fetch( 7 );
			$this->assertFalse( $out['ok'] );
			$this->assertSame( $c[2], $out['view'], $c[1] );
			$this->assertSame( array(), $cache->rows );
		}
	}

	public function test_a_timeout_or_an_unreadable_answer_is_the_exit_screen_never_an_order_list(): void {
		foreach ( array( new FakeHttp( null ), new FakeHttp( 200, 'not json' ), new FakeHttp( 200, '{"ok":true,"unit":1}' ), new FakeHttp( 500, '' ) ) as $http ) {
			$out = $this->summary( $http )->fetch( 7 );
			$this->assertFalse( $out['ok'] );
			$this->assertSame( Summary::FALLBACK, $out['view'] );
		}
		$html = MyAccountDoors::html( array( 'ok' => false, 'view' => Summary::FALLBACK, 'code' => 'timeout' ), array( 'form' => '/f', 'nonce' => '', 'resend' => '/r', 'back' => '/b', 'workspace' => true ) );
		$this->assertStringContainsString( '暫時讀不到你的產品清單。', $html );
		$this->assertStringContainsString( '進入我的工作台', $html );
		$this->assertStringContainsString( '重新整理', $html );
		$this->assertStringNotContainsString( 'name="product_key" value="content"', $html );
	}

	public function test_the_page_uses_the_apps_words_escaped_and_only_held_rows_get_a_button(): void {
		$out  = $this->summary( new FakeHttp( 200, $this->ok() ) )->fetch( 7 );
		$html = MyAccountDoors::html( $out, array( 'form' => '/f', 'nonce' => '', 'resend' => '/r', 'back' => '/b', 'workspace' => true ) );
		$this->assertStringContainsString( 'Soulful &lt;b&gt;', $html );
		$this->assertStringContainsString( '方案內 9', $html );
		$this->assertStringContainsString( '未開通', $html );
		$this->assertStringContainsString( 'value="content"', $html );
		$this->assertStringNotContainsString( 'value="video"', $html );
		$this->assertStringContainsString( 'min-height:44px', $html );
		$this->assertStringNotContainsString( 'style="', $html, 'classes and one style block, no inline styles' );
	}

	public function test_a_key_outside_the_summary_list_is_refused_and_the_workspace_needs_no_summary(): void {
		$out = $this->summary( new FakeHttp( 200, $this->ok() ) )->fetch( 7 );
		$this->assertNull( MyAccountDoors::pressRefusal( true, $out, 'content' ) );
		$this->assertSame( 'not_offered', MyAccountDoors::pressRefusal( true, $out, 'video' ), 'listed but not enterable' );
		$this->assertSame( 'not_offered', MyAccountDoors::pressRefusal( true, $out, 'studio' ), 'not in the list at all' );
		$this->assertSame( 'unavailable', MyAccountDoors::pressRefusal( true, array( 'ok' => false, 'view' => Summary::FALLBACK, 'code' => 'timeout' ), 'content' ) );
		$this->assertNull( MyAccountDoors::pressRefusal( true, null, MyAccountDoors::WORKSPACE ) );
		$this->assertSame( 'email_unverified', MyAccountDoors::pressRefusal( false, $out, 'content' ) );
	}

	public function test_a_delivered_payment_event_clears_that_members_cached_summary(): void {
		$cache            = new FakeSummaryCache();
		$cache->rows[7]   = array( 'unit' => 'x' );
		$cache->rows[8]   = array( 'unit' => 'y' );
		$job              = array( 'event_id' => 'e1', 'body' => '{"wp_user_id":7,"kind":"credit_pack"}', 'note_id' => 1, 'attempt' => 0 );
		$sender           = new PaymentSender( new FakeHttp( 200 ), new FakeQueue(), new FakeShop(), null, $cache );
		$this->assertSame( 'done', $sender->deliver( $job, $this->settings() ) );
		$this->assertArrayNotHasKey( 7, $cache->rows );
		$this->assertArrayHasKey( 8, $cache->rows );

		$cache->rows[7] = array( 'unit' => 'x' );
		( new PaymentSender( new FakeHttp( 503 ), new FakeQueue(), new FakeShop(), null, $cache ) )->deliver( $job, $this->settings() );
		$this->assertArrayHasKey( 7, $cache->rows, 'not delivered: the cache stays' );
	}
}
