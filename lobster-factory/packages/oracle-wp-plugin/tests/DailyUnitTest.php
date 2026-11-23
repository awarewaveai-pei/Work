<?php
/**
 * WP-free units for P3 (ORACLE-WP-SPEC §3 P3′): the hourly pick in four time zones (Europe/London on both
 * DST change days), never twice for one local date, only confirmed + subscribed, no back-fill; the letter
 * refuses incomplete engine results; Resend (Svix) signatures; the mailer setting.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Daily\Letter;
use AwareWave\Oracle\Daily\Schedule;
use AwareWave\Oracle\Daily\Store;
use AwareWave\Oracle\Daily\Svix;
use AwareWave\Oracle\Settings\Normalize;
use PHPUnit\Framework\TestCase;

final class DailyUnitTest extends TestCase {

	private static function profile( int $id, string $tz, string $status = Store::CONFIRMED ): array {
		return array(
			'subscriber_id' => $id,
			'tz'            => $tz,
			'status'        => $status,
			'locale'        => 'en',
			'data'          => '',
		);
	}

	/**
	 * Hourly runs (on the hour, UTC) for $hours from $startUtc; a pick is recorded like Store::claim would.
	 *
	 * @param array<int,array<string,mixed>> $profiles
	 * @param array<int,string>              $status
	 * @return array<int,array<int,string>> per subscriber: "local date local time" of each pick
	 */
	private static function simulate( array $profiles, array $status, string $startUtc, int $hours ): array {
		$sent  = array();
		$picks = array();
		$t0    = ( new \DateTimeImmutable( $startUtc, new \DateTimeZone( 'UTC' ) ) )->getTimestamp();
		for ( $h = 0; $h < $hours; $h++ ) {
			$now = $t0 + $h * 3600;
			foreach ( Schedule::pick( $profiles, $status, $sent, $now ) as $p ) {
				$id = $p['profile']['subscriber_id'];
				$sent[ Schedule::key( $id, $p['date'] ) ] = true;
				$local = ( new \DateTimeImmutable( '@' . $now ) )->setTimezone( new \DateTimeZone( $p['profile']['tz'] ) );
				$picks[ $id ][] = $p['date'] . ' ' . $local->format( 'H:i' );
			}
		}
		return $picks;
	}

	public function testFourZonesPickedOnceAfterSevenLocal(): void {
		$profiles = array(
			self::profile( 1, 'Asia/Taipei' ),
			self::profile( 2, 'Europe/London' ),
			self::profile( 3, 'America/Los_Angeles' ),
			self::profile( 4, 'Asia/Kolkata' ),
		);
		$status   = array_fill_keys( array( 1, 2, 3, 4 ), 'subscribed' );
		// 2026-03-29: London springs forward (01:00 GMT -> 02:00 BST). Hourly runs from before 07:00 in every
		// zone on 03-28 (20:00 UTC on 03-27 = 04:00 Taipei) through 03-30 everywhere.
		$picks = self::simulate( $profiles, $status, '2026-03-27 20:00', 72 );
		// (Los Angeles is still on 03-27 at the first run, past 07:00: that day is picked too.)
		$window = function ( array $list ): array {
			return array_values(
				array_filter(
					$list,
					function ( $s ) {
						return $s >= '2026-03-28' && $s < '2026-03-31';
					}
				)
			);
		};
		$three = array( '2026-03-28 07:00', '2026-03-29 07:00', '2026-03-30 07:00' );
		$this->assertSame( $three, $window( $picks[1] ) );
		$this->assertSame( $three, $window( $picks[2] ) );
		$this->assertSame( $three, $window( $picks[3] ) );
		// Kolkata is UTC+5:30: the first hourly run after 07:00 local is 07:30.
		$this->assertSame( array( '2026-03-28 07:30', '2026-03-29 07:30', '2026-03-30 07:30' ), $window( $picks[4] ) );
		foreach ( $picks as $id => $list ) {
			$days = array_map(
				function ( $s ) {
					return substr( $s, 0, 10 );
				},
				$list
			);
			$this->assertSame( array_unique( $days ), $days, "subscriber $id picked twice on one local date" );
		}
	}

	public function testLondonFallBackDayStillOnce(): void {
		// 2026-10-25: 02:00 BST -> 01:00 GMT (the hour 01:xx happens twice).
		$picks = self::simulate( array( self::profile( 2, 'Europe/London' ) ), array( 2 => 'subscribed' ), '2026-10-24 00:00', 72 );
		$this->assertSame( array( '2026-10-24 07:00', '2026-10-25 07:00', '2026-10-26 07:00' ), $picks[2] );
	}

	public function testSameDayRerunDoesNotPickAgain(): void {
		$p   = array( self::profile( 1, 'Asia/Taipei' ) );
		$now = ( new \DateTimeImmutable( '2026-11-23 01:00', new \DateTimeZone( 'UTC' ) ) )->getTimestamp(); // 09:00 Taipei
		$this->assertCount( 1, Schedule::pick( $p, array( 1 => 'subscribed' ), array(), $now ) );
		$this->assertCount( 0, Schedule::pick( $p, array( 1 => 'subscribed' ), array( '1|2026-11-23' => true ), $now ) );
		$this->assertCount( 0, Schedule::pick( $p, array( 1 => 'subscribed' ), array( '1|2026-11-23' => true ), $now + 3600 ) );
	}

	public function testOnlyConfirmedAndSubscribedArePicked(): void {
		$now = ( new \DateTimeImmutable( '2026-11-23 03:00', new \DateTimeZone( 'UTC' ) ) )->getTimestamp(); // 11:00 Taipei
		$profiles = array(
			self::profile( 1, 'Asia/Taipei' ),
			self::profile( 2, 'Asia/Taipei', Store::PENDING ),
			self::profile( 3, 'Asia/Taipei' ),
			self::profile( 4, 'Asia/Taipei' ),
			self::profile( 5, 'Asia/Taipei' ),
			self::profile( 6, 'Asia/Taipei' ),
			self::profile( 7, 'Asia/Taipei' ),
			self::profile( 8, 'Not/AZone' ),
		);
		$status = array(
			1 => 'subscribed',
			2 => 'subscribed',
			3 => 'pending',
			4 => 'unsubscribed',
			5 => 'bounced',
			6 => 'complained',
			// 7: contact gone
			8 => 'subscribed',
		);
		$ids = array_map(
			function ( $p ) {
				return $p['profile']['subscriber_id'];
			},
			Schedule::pick( $profiles, $status, array(), $now )
		);
		$this->assertSame( array( 1 ), $ids );
	}

	public function testStalledSchedulerDoesNotBackfill(): void {
		// Last run 2026-11-20; the next run is 2026-11-23 09:00 Taipei: only 2026-11-23 is picked.
		$now   = ( new \DateTimeImmutable( '2026-11-23 01:00', new \DateTimeZone( 'UTC' ) ) )->getTimestamp();
		$picks = Schedule::pick( array( self::profile( 1, 'Asia/Taipei' ) ), array( 1 => 'subscribed' ), array( '1|2026-11-20' => true ), $now );
		$this->assertSame( array( '2026-11-23' ), array_column( $picks, 'date' ) );
		$this->assertNull( Schedule::dueDate( 'Asia/Taipei', $now - 3 * 3600 ) ); // 06:00 local
	}

	/** @return array<string,mixed> */
	private static function data(): array {
		return array(
			'date'           => '2026-11-23',
			'scores'         => array( 'overall' => 4, 'love' => 3, 'career' => 5, 'wealth' => 2, 'health' => 1 ),
			'luckyColors'    => array( 'green', '<b>teal</b>' ),
			'luckyNumbers'   => array( 3, 8 ),
			'luckyDirection' => 'East',
			'yi'             => array( 'travel {{contact.email}}' ),
			'ji'             => array(),
		);
	}

	public function testLetterFromEngineResult(): void {
		$labels = array(
			'subject' => 'Daily %s',
			'intro'   => 'Hi',
			'yi'      => 'Good for:',
			'ji'      => 'Avoid:',
			'sep'     => ', ',
		);
		$l = Letter::build( self::data(), '2026-11-23', $labels );
		$this->assertSame( 'Daily 2026-11-23', $l['subject'] );
		$this->assertStringContainsString( '★★★★☆', $l['html'] );
		$this->assertStringContainsString( '&lt;b&gt;teal&lt;/b&gt;', $l['html'] );
		$this->assertStringNotContainsString( '{{', $l['html'] );
		$this->assertStringContainsString( '<strong>Avoid:</strong> —', $l['html'] );
		$this->assertStringContainsString( 'green, &lt;b&gt;teal&lt;/b&gt;', $l['html'] );
	}

	public function testLetterRefusesIncompleteOrWrongDay(): void {
		$this->assertNull( Letter::build( self::data(), '2026-11-24', array() ) );
		$this->assertNull( Letter::build( null, '2026-11-23', array() ) );
		foreach ( array( 'scores', 'luckyColors', 'luckyNumbers', 'luckyDirection', 'yi', 'ji' ) as $field ) {
			$d = self::data();
			unset( $d[ $field ] );
			$this->assertNull( Letter::build( $d, '2026-11-23', array() ), $field );
		}
		$d                     = self::data();
		$d['scores']['health'] = 6;
		$this->assertNull( Letter::build( $d, '2026-11-23', array() ) );
		$d                = self::data();
		$d['luckyColors'] = array();
		$this->assertNull( Letter::build( $d, '2026-11-23', array() ) );
	}

	public function testSvixSignature(): void {
		$secret = 'whsec_' . base64_encode( str_repeat( 'k', 24 ) );
		$body   = '{"type":"email.bounced","data":{"to":["a@example.test"]}}';
		$ts     = '1763860000';
		$sig    = base64_encode( hash_hmac( 'sha256', 'msg_1.' . $ts . '.' . $body, str_repeat( 'k', 24 ), true ) );
		$now    = (int) $ts + 10;
		$this->assertTrue( Svix::verify( $secret, 'msg_1', $ts, 'v1,bogus v1,' . $sig, $body, $now ) );
		$this->assertFalse( Svix::verify( $secret, 'msg_1', $ts, 'v1,' . $sig, $body . ' ', $now ) );
		$this->assertFalse( Svix::verify( $secret, 'msg_2', $ts, 'v1,' . $sig, $body, $now ) );
		$this->assertFalse( Svix::verify( $secret, 'msg_1', $ts, 'v1,' . $sig, $body, $now + 400 ) );
		$this->assertFalse( Svix::verify( 'whsec_' . base64_encode( str_repeat( 'x', 24 ) ), 'msg_1', $ts, 'v1,' . $sig, $body, $now ) );
		$this->assertFalse( Svix::verify( '', 'msg_1', $ts, 'v1,' . $sig, $body, $now ) );
		$this->assertFalse( Svix::verify( $secret, 'msg_1', $ts, 'v2,' . $sig, $body, $now ) );
	}

	public function testMailerSettingDefaultsOff(): void {
		$this->assertSame( Normalize::MAILER_NONE, Normalize::settings( array() )['mailer'] );
		$this->assertSame( Normalize::MAILER_NONE, Normalize::settings( array( 'mailer' => 'smtp' ) )['mailer'] );
		$on = Normalize::settings( array( 'mailer' => 'fluentcrm' ) );
		$this->assertSame( Normalize::MAILER_FLUENTCRM, $on['mailer'] );
		$this->assertSame( $on, Normalize::settings( $on ) ); // second sanitize pass is a no-op
	}
}
