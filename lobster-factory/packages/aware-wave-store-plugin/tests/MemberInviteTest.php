<?php
/**
 * Staff-invited members (card M6): the code is sent only for a verified email, with the right fields and signature;
 * every answer draws its own page; a member without a code is untouched.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\MemberInvite;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

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

	/** @var int */
	private $now = 1700000000;

	private function invite( FakeHttp $http ): MemberInvite {
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
		$this->assertSame( $this->code(), $this->store[ self::UID ][ MemberInvite::META_CODE ], 'the code waits for the verify click' );
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
		$this->assertSame(
			array( 'kind' => 'member_invite', 'wp_user_id' => self::UID, 'email' => 'Owner@Soulful.tw', 'email_verified' => true, 'invite_code' => $this->code() ),
			json_decode( $req['body'], true )
		);
		$this->assertSame( Signature::sign( $req['body'], self::SECRET ), $req['headers'][ Signature::PAYMENT_HEADER ], 'the payment events\' signature over the exact bytes' );
		$this->assertSame( array( 'view' => MemberInvite::LINKED, 'code' => '', 'unit' => 'Soulful <b>' ), $out );
		$this->assertArrayNotHasKey( MemberInvite::META_CODE, $this->store[ self::UID ], 'the plain code is not kept after a success' );

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
		$this->assertArrayNotHasKey( MemberInvite::META_CODE, $this->store[ self::UID ] );
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
			$this->assertSame( $this->code(), $this->store[ self::UID ][ MemberInvite::META_CODE ], 'kept for 再試一次' );
			$html = MemberInvite::html( $invite->current( self::UID ), $this->ctx() );
			$this->assertStringContainsString( '暫時連不上', $html );
			$this->assertStringContainsString( 'value="' . MemberInvite::RETRY . '"', $html );
		}
	}

	public function test_a_held_code_is_not_replaced_by_another_link(): void {
		$this->member( false );
		$invite = $this->invite( new FakeHttp( 200, '{"ok":true}' ) );
		$this->assertTrue( $invite->hold( self::UID, $this->code() ) );
		$this->assertFalse( $invite->hold( self::UID, str_repeat( 'Z', 43 ) ), 'a second GET link must not swap out the waiting code' );
		$this->assertSame( $this->code(), $this->store[ self::UID ][ MemberInvite::META_CODE ] );
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
