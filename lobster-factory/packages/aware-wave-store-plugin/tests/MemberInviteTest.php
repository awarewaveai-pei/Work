<?php
/**
 * Staff-invited members (card M6): the code is sent only for a verified email, with the right fields and signature;
 * every answer draws its own page; a member without a code is untouched.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\HttpClient;
use AwareWave\Store\MemberInvite;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

/** Answers each member_invite by the code it carries; records the codes in send order. */
final class ScriptedHttp implements HttpClient {
	/** @var array<string,array{0:int|null,1:string}> */
	private $by;
	/** @var list<string> */
	public $sent = array();

	public function __construct( array $by ) {
		$this->by = $by;
	}

	public function post( string $url, array $headers, string $body, int $timeout = 15 ): array {
		$code         = (string) ( json_decode( $body, true )['invite_code'] ?? '' );
		$this->sent[] = $code;
		$ans          = $this->by[ $code ] ?? array( null, '' );
		return array( 'status' => $ans[0], 'body' => $ans[1], 'error' => $ans[0] === null ? 'timeout' : '' );
	}
}

final class MemberInviteTest extends TestCase {

	const SECRET = 'awarewave-test-vector-secret-0123456789abcdef';
	const UID    = 42;

	/** @var array<int,array<string,mixed>> */
	private $store = array();
	/** @var FakeMembers */
	private $members;

	private function code(): string {
		return str_repeat( 'Ab-_', 10 ) . 'xyz';
	}

	/** @return list<string> the held codes, oldest first */
	private function held(): array {
		$list = $this->store[ self::UID ][ MemberInvite::META_CODE ] ?? array();
		return array_map( function ( $h ) { return $h['code']; }, is_array( $list ) ? $list : array() );
	}

	/** @var int */
	private $now = 1700000000;

	private function invite( HttpClient $http ): MemberInvite {
		$this->members = $this->members ?? new FakeMembers();
		return new MemberInvite(
			new Settings( true, 'https://app.aware-wave.com', self::SECRET, self::SECRET ),
			$http,
			$this->members,
			null,
			array(
				'get'    => function ( int $uid, string $key ) {
					return $this->store[ $uid ][ $key ] ?? '';
				},
				'set'    => function ( int $uid, string $key, $value ): void {
					$this->store[ $uid ][ $key ] = $value;
				},
				'delete' => function ( int $uid, string $key ): void {
					unset( $this->store[ $uid ][ $key ] );
				},
			),
			function (): int {
				return $this->now;
			}
		);
	}

	private function member( bool $verified ): void {
		$this->members = new FakeMembers();
		$this->members->members[ self::UID ] = array( 'email' => 'Owner@Soulful.tw', 'display_name' => 'Owner', 'verified_email' => $verified ? 'owner@soulful.tw' : '' );
	}

	private function ctx(): array {
		return array( 'account' => 'https://aware-wave.com/my-account/', 'resend' => 'https://aware-wave.com/?resend=1', 'form' => 'https://aware-wave.com/wp-admin/admin-post.php', 'nonce' => '<input type="hidden" name="_wpnonce" value="n">' );
	}

	public function test_an_unverified_member_is_not_sent_and_sees_the_pending_page(): void {
		$this->member( false );
		$http   = new FakeHttp( 200, '{"ok":true}' );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $this->code() );
		$this->assertNull( $invite->process( self::UID ) );
		$this->assertSame( array(), $http->requests, 'no event before the email is verified' );
		$this->assertSame( array( $this->code() ), $this->held(), 'the code waits for the verify click' );
		$html = MemberInvite::html( $invite->current( self::UID ), $this->ctx() );
		$this->assertStringContainsString( '確認後會自動連上', $html );
		$this->assertStringContainsString( '重寄確認信', $html );
	}

	public function test_once_verified_the_signed_event_carries_the_member_and_the_code_and_the_code_is_dropped(): void {
		$this->member( false );
		$http   = new FakeHttp( 200, '{"ok":true,"organization":{"name":"Soulful <b>"}}' );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $this->code() );
		$invite->process( self::UID );
		$this->member( true );   // the verify click (WelcomeGift::VERIFIED) runs process again
		$invite = $this->invite( $http );
		$out    = $invite->process( self::UID );

		$this->assertCount( 1, $http->requests );
		$req = $http->requests[0];
		$this->assertSame( 'https://app.aware-wave.com/api/webhooks/awarewave-wp-member', $req['url'] );
		$sent = json_decode( $req['body'], true );
		$this->assertMatchesRegularExpression( '/^member_invite:42:[0-9a-f]{24}$/', $sent['event_id'] );
		$this->assertSame( gmdate( 'Y-m-d\TH:i:s\Z', $this->now ), $sent['occurred_at'], 'occurred_at = when the member opened the link' );
		unset( $sent['event_id'], $sent['occurred_at'] );
		$this->assertSame(
			array( 'kind' => 'member_invite', 'wp_user_id' => self::UID, 'email' => 'Owner@Soulful.tw', 'email_verified' => true, 'invite_code' => $this->code() ),
			$sent
		);
		$this->assertSame( Signature::sign( $req['body'], self::SECRET ), $req['headers'][ Signature::PAYMENT_HEADER ], 'the payment events\' signature over the exact bytes' );
		$this->assertSame( array( 'view' => MemberInvite::LINKED, 'code' => '', 'unit' => 'Soulful <b>' ), $out );
		$this->assertSame( array(), $this->held(), 'the plain code is not kept after a success' );

		$html = MemberInvite::html( $invite->current( self::UID ), $this->ctx() );
		$this->assertStringContainsString( '已連上〈Soulful &lt;b&gt;〉', $html );
		$this->assertStringContainsString( '到我的帳號', $html );
		$this->assertNull( $invite->current( self::UID ), 'the success is shown once' );
	}

	/** @return array<string,array{0:string,1:string}> */
	public function refusals(): array {
		$rows = array();
		foreach ( MemberInvite::REFUSALS as $code => $lines ) {
			$rows[ $code ] = array( $code, $lines[0] );
		}
		return $rows;
	}

	/** @dataProvider refusals */
	public function test_each_refusal_reads_as_its_own_reason_and_drops_the_code( string $code, string $why ): void {
		$this->member( true );
		$invite = $this->invite( new FakeHttp( 409, '{"ok":false,"error":"' . $code . '"}' ) );
		$invite->hold( self::UID, $this->code() );
		$this->assertSame( array( 'view' => MemberInvite::REFUSED, 'code' => $code, 'unit' => '' ), $invite->process( self::UID ) );
		$this->assertSame( array(), $this->held() );
		$html = MemberInvite::html( $invite->current( self::UID ), $this->ctx() );
		$this->assertStringContainsString( htmlspecialchars( $why, ENT_QUOTES, 'UTF-8' ), $html );
		$this->assertStringContainsString( htmlspecialchars( MemberInvite::REFUSALS[ $code ][1], ENT_QUOTES, 'UTF-8' ), $html );
	}

	public function test_an_unknown_refusal_names_its_code_and_a_retryable_answer_keeps_the_code_for_a_retry(): void {
		$this->member( true );
		$html = MemberInvite::html( MemberInvite::outcome( array( 'status' => 409, 'body' => '{"error":"email_taken"}', 'error' => '' ) ), $this->ctx() );
		$this->assertStringContainsString( '無法連上這個單位', $html );
		$this->assertStringContainsString( 'email_taken', $html );

		foreach ( array( null, 401, 404, 500, 503 ) as $status ) {
			$this->store = array();
			$invite      = $this->invite( new FakeHttp( $status, '{"ok":false,"error":"member_event_not_recorded"}' ) );
			$invite->hold( self::UID, $this->code() );
			$this->assertSame( MemberInvite::RETRY_VIEW, $invite->process( self::UID )['view'] );
			$this->assertSame( array( $this->code() ), $this->held(), 'kept for 再試一次' );
			$html = MemberInvite::html( $invite->current( self::UID ), $this->ctx() );
			$this->assertStringContainsString( '暫時連不上', $html );
			$this->assertStringContainsString( 'value="' . MemberInvite::RETRY . '"', $html );
		}
	}

	public function test_a_retry_sends_the_same_event_id_and_a_refusal_then_a_reopened_link_is_a_new_event(): void {
		$this->member( true );
		$http   = new FakeHttp( 503, '{"ok":false,"error":"member_event_not_recorded"}' );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $this->code() );
		$invite->process( self::UID );
		$this->now += 3600;
		$invite->process( self::UID );   // 再試一次
		$ids = array_map( function ( $r ) { return json_decode( $r['body'], true )['event_id']; }, $http->requests );
		$at  = array_map( function ( $r ) { return json_decode( $r['body'], true )['occurred_at']; }, $http->requests );
		$this->assertCount( 2, $ids );
		$this->assertSame( $ids[0], $ids[1], 'a retry is the same event' );
		$this->assertSame( $at[0], $at[1] );
		$http->status = 409;
		$http->body   = '{"ok":false,"error":"invite_email_mismatch"}';
		$invite->process( self::UID );   // final: the code is dropped
		$invite->hold( self::UID, $this->code() );   // the member fixed the email and opened the link again
		$invite->process( self::UID );
		$this->assertNotSame( $ids[0], json_decode( end( $http->requests )['body'], true )['event_id'], 'a new acceptance is a new event' );
	}

	public function test_after_void_and_reissue_the_new_link_is_sent_and_everything_is_cleared(): void {
		$a = str_repeat( 'A', 43 );
		$b = str_repeat( 'B', 43 );
		$this->member( false );
		$http   = new ScriptedHttp( array( $a => array( 409, '{"ok":false,"error":"invite_invalid"}' ), $b => array( 200, '{"ok":true,"organization":{"name":"Soulful"}}' ) ) );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $a );   // staff then voids A and reissues B
		$this->now += 60;
		$invite->hold( self::UID, $b );
		$this->member( true );
		$invite = $this->invite( $http );
		$this->assertSame( MemberInvite::LINKED, $invite->process( self::UID )['view'] );
		$this->assertSame( array( $b ), $http->sent, 'the newest link goes first; the void A is never needed' );
		$this->assertSame( array(), $this->held() );
	}

	public function test_when_the_newest_is_refused_the_next_valid_one_is_sent(): void {
		$a = str_repeat( 'A', 43 );
		$b = str_repeat( 'B', 43 );
		$this->member( true );
		$http   = new ScriptedHttp( array( $b => array( 409, '{"ok":false,"error":"invite_invalid"}' ), $a => array( 200, '{"ok":true,"organization":{"name":"Soulful"}}' ) ) );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $a );
		$invite->hold( self::UID, $b );
		$this->assertSame( array( 'view' => MemberInvite::LINKED, 'code' => '', 'unit' => 'Soulful' ), $invite->process( self::UID ) );
		$this->assertSame( array( $b, $a ), $http->sent );
		$this->assertSame( array(), $this->held() );
	}

	public function test_a_fourth_link_pushes_out_the_oldest(): void {
		$this->member( false );
		$invite = $this->invite( new FakeHttp( 200, '{"ok":true}' ) );
		foreach ( array( 'A', 'B', 'C', 'D' ) as $c ) {
			$this->now += 1;
			$this->assertTrue( $invite->hold( self::UID, str_repeat( $c, 43 ) ) );
		}
		$this->assertSame( array( str_repeat( 'B', 43 ), str_repeat( 'C', 43 ), str_repeat( 'D', 43 ) ), $this->held() );
		$this->assertFalse( $invite->hold( self::UID, str_repeat( 'D', 43 ) ), 'the same link twice is held once' );
	}

	public function test_a_code_held_past_the_invite_days_is_dropped_and_never_sent(): void {
		$this->member( false );
		$http   = new FakeHttp( 200, '{"ok":true}' );
		$invite = $this->invite( $http );
		$invite->hold( self::UID, $this->code() );
		$this->now += MemberInvite::CODE_TTL + 1;   // the member never verified within 14 days
		$this->member( true );
		$invite = $this->invite( $http );
		$this->assertNull( $invite->process( self::UID ) );
		$this->assertSame( array(), $http->requests, 'an expired code is not sent' );
		$this->assertSame( array(), $this->store[ self::UID ], 'the plain code and its time are deleted' );
		$this->assertNull( $invite->current( self::UID ) );
		$this->assertSame( 14 * 86400, MemberInvite::CODE_TTL, 'same as next-admin MEMBER_INVITE_DAYS' );
	}

	public function test_a_member_without_a_code_is_unchanged(): void {
		$this->member( true );
		$http   = new FakeHttp( 200, '{"ok":true}' );
		$invite = $this->invite( $http );
		$this->assertNull( $invite->process( self::UID ) );
		$this->assertNull( $invite->current( self::UID ) );
		$invite->hold( self::UID, 'not-a-code' );
		$this->assertNull( $invite->process( self::UID ) );
		$this->assertSame( array(), $http->requests );
		$this->assertSame( array(), $this->store, 'nothing written for a member who never had an invite' );
	}
}
