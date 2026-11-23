<?php
/**
 * Who gets today's letter (ORACLE-WP-SPEC §2-8, §7-1). WP-free, unit-tested.
 *
 * A subscriber is due when, in their own time zone, the clock has passed SEND_HOUR:00 and their local date
 * has no send record yet. Only today's local date is ever considered: a scheduler that stalled for a day
 * never back-fills the missed date. The send record's unique key (subscriber, local date) is what makes it
 * "at most one per local date" — also across DST changes and parallel runs; pick() only narrows the list.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

final class Schedule {

	const SEND_HOUR = 7;

	/** FluentCRM status that may receive mail; anything else (pending, unsubscribed, bounced, complained, spammed) may not. */
	const SENDABLE = 'subscribed';

	/** The subscriber's local date (Y-m-d) when their local clock is at or past SEND_HOUR:00, else null. */
	public static function dueDate( string $tz, int $nowUtc ): ?string {
		try {
			$zone = new \DateTimeZone( $tz );
		} catch ( \Exception $e ) {
			return null;
		}
		$local = ( new \DateTimeImmutable( '@' . $nowUtc ) )->setTimezone( $zone );
		return (int) $local->format( 'G' ) >= self::SEND_HOUR ? $local->format( 'Y-m-d' ) : null;
	}

	/**
	 * @param array<int,array{subscriber_id:int,tz:string,status:string}> $profiles daily profiles
	 * @param array<int,string>                                           $crmStatus FluentCRM status by subscriber id
	 * @param array<string,bool>                                          $sent      keys "<subscriber id>|<Y-m-d>" already recorded
	 * @return array<int,array{profile:array<string,mixed>,date:string}>
	 */
	public static function pick( array $profiles, array $crmStatus, array $sent, int $nowUtc ): array {
		$out = array();
		foreach ( $profiles as $p ) {
			$id = (int) $p['subscriber_id'];
			if ( $p['status'] !== Store::CONFIRMED || ( $crmStatus[ $id ] ?? '' ) !== self::SENDABLE ) {
				continue;
			}
			$date = self::dueDate( (string) $p['tz'], $nowUtc );
			if ( $date === null || isset( $sent[ self::key( $id, $date ) ] ) ) {
				continue;
			}
			$out[] = array(
				'profile' => $p,
				'date'    => $date,
			);
		}
		return $out;
	}

	public static function key( int $subscriberId, string $date ): string {
		return $subscriberId . '|' . $date;
	}
}
