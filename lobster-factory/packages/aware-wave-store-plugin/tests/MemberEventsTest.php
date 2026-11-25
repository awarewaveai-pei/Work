<?php
/**
 * WordPress deleted a user / changed an email (card M10): one signed event each, the right fields, queued through the
 * scheduler; a retry carries the same event_id.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\MemberEvents;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class MemberEventsTest extends TestCase {

	const SECRET = 'awarewave-test-vector-secret-0123456789abcdef';

	/** @var list<array{0:int,1:array}> */
	private $queued = array();
	/** @var list<string> */
	private $logged = array();
	/** @var int */
	private $now = 1764064800;   // 2025-11-25T10:00:00Z

	private function events( FakeHttp $http, bool $enabled = true ): MemberEvents {
		return new MemberEvents(
			new Settings( $enabled, 'https://app.aware-wave.com', self::SECRET, self::SECRET ),
			$http,
			function ( int $at, array $job ): void {
				$this->queued[] = array( $at, $job );
			},
			function (): int {
				return $this->now;
			},
			function ( string $line ): void {
				$this->logged[] = $line;
			}
		);
	}

	/** Queue the event, then send every queued job once (the scheduler running them). @return list<array> bodies sent */
	private function drain( MemberEvents $ev, FakeHttp $http ): array {
		while ( $this->queued !== array() ) {
			$job = array_shift( $this->queued )[1];
			$ev->deliver( $job );
			if ( count( $http->requests ) > 5 ) {
				break;
			}
		}
		return array_map( function ( $r ) { return json_decode( $r['body'], true ); }, $http->requests );
	}

	public function test_a_deleted_user_is_one_signed_member_deleted_event(): void {
		$http = new FakeHttp( 200, '{"ok":true,"result":"deleted"}' );
		$ev   = $this->events( $http );
		$ev->onDeleteUser( 42 );
		$this->assertCount( 1, $this->queued );
		$this->assertSame( 0, $this->queued[0][0], 'as soon as possible' );
		$sent = $this->drain( $ev, $http );
		$this->assertCount( 1, $sent );
		$this->assertMatchesRegularExpression( '/^member_deleted:42:[0-9a-f]{24}$/', $sent[0]['event_id'] );
		$this->assertSame( array( 'kind' => 'member_deleted', 'wp_user_id' => 42, 'occurred_at' => '2025-11-25T10:00:00Z' ),
			array_diff_key( $sent[0], array( 'event_id' => 1 ) ) );
		$req = $http->requests[0];
		$this->assertSame( 'https://app.aware-wave.com/api/webhooks/awarewave-wp-member', $req['url'] );
		$this->assertSame( Signature::sign( $req['body'], self::SECRET ), $req['headers'][ Signature::PAYMENT_HEADER ] );
	}

	public function test_an_email_change_is_one_event_with_both_addresses_and_no_change_is_none(): void {
		$http = new FakeHttp( 200, '{"ok":true,"result":"audited"}' );
		$ev   = $this->events( $http );
		$ev->onEmailChange( 42, 'Owner@Soulful.tw', ' owner@soulful.tw ' );   // same address: nothing
		$ev->onEmailChange( 42, 'Owner@Soulful.tw', 'Boss@New.example' );
		$sent = $this->drain( $ev, $http );
		$this->assertCount( 1, $sent );
		$this->assertMatchesRegularExpression( '/^member_email_changed:42:[0-9a-f]{24}$/', $sent[0]['event_id'] );
		$this->assertSame(
			array( 'kind' => 'member_email_changed', 'wp_user_id' => 42, 'occurred_at' => '2025-11-25T10:00:00Z', 'old_email' => 'owner@soulful.tw', 'new_email' => 'boss@new.example' ),
			array_diff_key( $sent[0], array( 'event_id' => 1 ) )
		);
	}

	public function test_a_retryable_answer_resends_the_same_event_later_and_a_final_one_stops(): void {
		$http = new FakeHttp( 503, '{"ok":false,"error":"member_event_not_recorded"}' );
		$ev   = $this->events( $http );
		$ev->onDeleteUser( 42 );
		$first = array_shift( $this->queued )[1];
		$this->assertSame( 'retry', $ev->deliver( $first ) );
		$this->assertCount( 1, $this->queued );
		[ $at, $again ] = $this->queued[0];
		$this->assertGreaterThan( $this->now, $at, 'scheduled later, with backoff' );
		$this->assertSame( $first['body'], $again['body'], 'the same bytes, so the same event_id' );
		$this->assertSame( 1, $again['attempt'] );
		$http->status = 409;
		$http->body   = '{"ok":false,"error":"event_stale"}';
		$this->assertSame( 'final', $ev->deliver( array_shift( $this->queued )[1] ) );
		$this->assertSame( array(), $this->queued );
		$this->assertStringContainsString( 'refused', end( $this->logged ) );
	}

	public function test_switched_off_nothing_is_queued_or_sent(): void {
		$http = new FakeHttp( 200 );
		$ev   = $this->events( $http, false );
		$ev->onDeleteUser( 42 );
		$ev->onEmailChange( 42, 'a@b.tw', 'c@d.tw' );
		$this->assertSame( array(), $this->queued );
		$this->assertSame( 'disabled', $ev->deliver( array( 'event_id' => 'member_deleted:42:x', 'body' => '{}', 'attempt' => 0 ) ) );
		$this->assertSame( array(), $http->requests );
	}
}
