<?php
/**
 * Daily-letter tables (ORACLE-WP-SPEC §2-8) and every query on them.
 *  - {prefix}aworacle_daily_profiles  one row per FluentCRM contact. Clear columns: ids, status, the letter's
 *        time zone and language (the scheduler needs them), timestamps. Birth data only as Vault blobs:
 *        data          the active request, bound to "daily:<subscriber id>"
 *        pending_data  a request waiting for confirmation ({birth, tz, locale}), bound to "daily-pending:<id>"
 *  - {prefix}aworacle_daily_sent      UNIQUE (subscriber_id, local_date): the at-most-one-per-day claim
 *  - {prefix}aworacle_daily_events    UNIQUE event_id: Resend webhook deliveries already handled
 *
 * Consent invariant: data only ever becomes active through confirm() with the single-use token mailed for
 * that very request (Daily\Confirm, POST only). A new request for an address never touches the active letter
 * until it is confirmed, so nobody can change or stop someone else's letter by submitting the form.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Crypto\Vault;

final class Store {

	const PENDING   = 'pending';
	const CONFIRMED = 'confirmed';

	/** A request not confirmed within this many days expires (and a never-confirmed profile is deleted). */
	const PENDING_DAYS = 7;
	/** Send records and webhook ids are kept this long. */
	const SENT_KEEP_DAYS   = 60;
	const EVENT_KEEP_DAYS  = 30;

	/** sent.state */
	const CLAIMED = 'claimed';
	const SENT    = 'sent';
	const FAILED  = 'failed';

	const TABLES = array( 'aworacle_daily_profiles', 'aworacle_daily_sent', 'aworacle_daily_events' );

	public static function profiles(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLES[0];
	}

	public static function sent(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLES[1];
	}

	public static function events(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLES[2];
	}

	public static function activeContext( int $subscriberId ): string {
		return 'daily:' . $subscriberId;
	}

	public static function pendingContext( int $subscriberId ): string {
		return 'daily-pending:' . $subscriberId;
	}

	/** dbDelta for the three tables; true when all exist afterwards. Called from Members\Store::install(). */
	public static function install( string $charset ): bool {
		dbDelta(
			'CREATE TABLE ' . self::profiles() . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  subscriber_id bigint(20) unsigned NOT NULL,
  user_id bigint(20) unsigned NOT NULL DEFAULT 0,
  status varchar(12) NOT NULL,
  tz varchar(64) NOT NULL DEFAULT '',
  locale varchar(8) NOT NULL DEFAULT '',
  data text NULL,
  pending_data text NULL,
  confirm_hash char(64) NULL,
  pending_at datetime NULL,
  confirmed_at datetime NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY subscriber_id (subscriber_id),
  KEY user_id (user_id),
  KEY status (status)
) {$charset};"
		);
		dbDelta(
			'CREATE TABLE ' . self::sent() . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  subscriber_id bigint(20) unsigned NOT NULL,
  local_date date NOT NULL,
  state varchar(12) NOT NULL,
  created_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY subscriber_day (subscriber_id,local_date),
  KEY created_at (created_at)
) {$charset};"
		);
		dbDelta(
			'CREATE TABLE ' . self::events() . " (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  event_id varchar(100) NOT NULL,
  created_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY event_id (event_id),
  KEY created_at (created_at)
) {$charset};"
		);
		return self::tablesExist();
	}

	public static function tablesExist(): bool {
		global $wpdb;
		foreach ( array( self::profiles(), self::sent(), self::events() ) as $table ) {
			if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) ) !== $table ) {
				return false;
			}
		}
		return true;
	}

	public static function drop(): void {
		global $wpdb;
		foreach ( array( self::profiles(), self::sent(), self::events() ) as $table ) {
			$wpdb->query( 'DROP TABLE IF EXISTS ' . $table ); // phpcs:ignore WordPress.DB.PreparedSQL -- fixed names
		}
	}

	/** @return array<string,mixed>|null */
	public static function get( int $subscriberId ): ?array {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::profiles() . ' WHERE subscriber_id = %d', $subscriberId ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		return is_array( $row ) ? $row : null;
	}

	/**
	 * Record a new request for this contact (sealed {birth, tz, locale}) with the sha256 of its confirmation
	 * token; the active letter is not touched, and an earlier unconfirmed request (and its link) is replaced.
	 * Returns false when a request was already recorded in the last $throttleSeconds (nothing changed).
	 *
	 * @param array{birth:array<string,mixed>,tz:string,locale:string} $request
	 */
	public static function savePending( int $subscriberId, int $userId, array $request, string $key, string $confirmHash, int $throttleSeconds ): bool {
		global $wpdb;
		$now  = current_time( 'mysql', true );
		$blob = Vault::seal( $request, $key, self::pendingContext( $subscriberId ) );
		$row  = self::get( $subscriberId );
		if ( $row ) {
			if ( $row['pending_at'] && strtotime( $row['pending_at'] . ' UTC' ) > time() - $throttleSeconds ) {
				return false;
			}
			$wpdb->update(
				self::profiles(),
				array(
					'pending_data' => $blob,
					'confirm_hash' => $confirmHash,
					'pending_at'   => $now,
					'updated_at'   => $now,
					'user_id'      => $userId > 0 ? $userId : (int) $row['user_id'],
				),
				array( 'subscriber_id' => $subscriberId )
			);
			return true;
		}
		// INSERT IGNORE: of two parallel first requests for one contact, only the row that landed counts.
		$n = $wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . self::profiles() . ' (subscriber_id, user_id, status, pending_data, confirm_hash, pending_at, created_at, updated_at) VALUES (%d, %d, %s, %s, %s, %s, %s, %s)', // phpcs:ignore WordPress.DB.PreparedSQL
				$subscriberId,
				max( 0, $userId ),
				self::PENDING,
				$blob,
				$confirmHash,
				$now,
				$now,
				$now
			)
		);
		return $n === 1;
	}

	/**
	 * The request this token confirms, without confirming it (the GET page shows it), or null: no request,
	 * expired, token does not match (a newer request replaced it), or unreadable.
	 *
	 * @return array{birth:array<string,mixed>,tz:string,locale:string}|null
	 */
	public static function pendingRequest( int $subscriberId, string $token, string $key ): ?array {
		$row = self::get( $subscriberId );
		if ( ! $row || ! $row['pending_data'] || ! $row['pending_at'] || ! $row['confirm_hash'] || $key === '' ) {
			return null;
		}
		if ( strtotime( $row['pending_at'] . ' UTC' ) < time() - self::PENDING_DAYS * DAY_IN_SECONDS ) {
			return null;
		}
		if ( ! hash_equals( (string) $row['confirm_hash'], hash( 'sha256', $token ) ) ) {
			return null;
		}
		$req = Vault::open( (string) $row['pending_data'], $key, self::pendingContext( $subscriberId ) );
		if ( ! is_array( $req ) || ! is_array( $req['birth'] ?? null ) || ! is_string( $req['tz'] ?? null ) || ! is_string( $req['locale'] ?? null ) ) {
			return null;
		}
		return $req;
	}

	/**
	 * Make the request this token belongs to the active letter. Compare-and-set on the token hash: the
	 * request shown on the GET page is the one activated, and a link works once.
	 */
	public static function confirm( int $subscriberId, string $token, string $key ): bool {
		global $wpdb;
		$req = self::pendingRequest( $subscriberId, $token, $key );
		if ( $req === null ) {
			return false;
		}
		$now     = current_time( 'mysql', true );
		$changed = $wpdb->query(
			$wpdb->prepare(
				'UPDATE ' . self::profiles() . ' SET status = %s, tz = %s, locale = %s, data = %s, pending_data = NULL, confirm_hash = NULL, pending_at = NULL, confirmed_at = %s, updated_at = %s WHERE subscriber_id = %d AND confirm_hash = %s', // phpcs:ignore WordPress.DB.PreparedSQL
				self::CONFIRMED,
				$req['tz'],
				$req['locale'],
				Vault::seal( $req['birth'], $key, self::activeContext( $subscriberId ) ),
				$now,
				$now,
				$subscriberId,
				hash( 'sha256', $token )
			)
		);
		return is_int( $changed ) && $changed > 0;
	}

	/** @return array<int,array{subscriber_id:int,tz:string,locale:string,status:string,data:string}> */
	public static function confirmedProfiles(): array {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT subscriber_id, tz, locale, status, data FROM ' . self::profiles() . ' WHERE status = %s ORDER BY subscriber_id', self::CONFIRMED ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[] = array(
				'subscriber_id' => (int) $r['subscriber_id'],
				'tz'            => (string) $r['tz'],
				'locale'        => (string) $r['locale'],
				'status'        => (string) $r['status'],
				'data'          => (string) $r['data'],
			);
		}
		return $out;
	}

	/**
	 * "<subscriber id>|<date>" for every record on the given dates (any state: claimed, sent or failed).
	 *
	 * @param array<int,string> $dates
	 * @return array<string,bool>
	 */
	public static function sentKeys( array $dates ): array {
		global $wpdb;
		$dates = array_values( array_unique( $dates ) );
		if ( ! $dates ) {
			return array();
		}
		$in   = implode( ',', array_fill( 0, count( $dates ), '%s' ) );
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT subscriber_id, local_date FROM ' . self::sent() . " WHERE local_date IN ($in)", $dates ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[ Schedule::key( (int) $r['subscriber_id'], (string) $r['local_date'] ) ] = true;
		}
		return $out;
	}

	/** The one gate before sending: true only for the caller whose INSERT created the (subscriber, date) row. */
	public static function claim( int $subscriberId, string $date ): bool {
		global $wpdb;
		$n = $wpdb->query(
			$wpdb->prepare(
				'INSERT IGNORE INTO ' . self::sent() . ' (subscriber_id, local_date, state, created_at) VALUES (%d, %s, %s, %s)', // phpcs:ignore WordPress.DB.PreparedSQL
				$subscriberId,
				$date,
				self::CLAIMED,
				current_time( 'mysql', true )
			)
		);
		return $n === 1;
	}

	/** Nothing was sent: free the day so a later run may try again. Only a claim is released, never a sent row. */
	public static function release( int $subscriberId, string $date ): void {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::sent() . ' WHERE subscriber_id = %d AND local_date = %s AND state = %s', $subscriberId, $date, self::CLAIMED ) ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	public static function mark( int $subscriberId, string $date, string $state ): void {
		global $wpdb;
		$wpdb->update( self::sent(), array( 'state' => $state ), array( 'subscriber_id' => $subscriberId, 'local_date' => $date ) );
	}

	/** First delivery of this webhook event? (INSERT IGNORE on the unique id.) */
	public static function takeEvent( string $eventId ): bool {
		global $wpdb;
		$n = $wpdb->query( $wpdb->prepare( 'INSERT IGNORE INTO ' . self::events() . ' (event_id, created_at) VALUES (%s, %s)', $eventId, current_time( 'mysql', true ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		return $n === 1;
	}

	public static function forgetEvent( string $eventId ): void {
		global $wpdb;
		$wpdb->delete( self::events(), array( 'event_id' => $eventId ) );
	}

	/**
	 * The profile of one contact. $withHistory: also its send records — for contact deletion and privacy
	 * erasure. Unsubscribe / bounce / complaint keep them (id + date only, purged after SENT_KEEP_DAYS) so a
	 * same-day re-subscription cannot claim that day again.
	 */
	public static function deleteForSubscriber( int $subscriberId, bool $withHistory = true ): int {
		global $wpdb;
		if ( $subscriberId <= 0 || ! self::tablesExist() ) {
			return 0;
		}
		$n = (int) $wpdb->delete( self::profiles(), array( 'subscriber_id' => $subscriberId ) );
		if ( $withHistory ) {
			$wpdb->delete( self::sent(), array( 'subscriber_id' => $subscriberId ) );
		}
		return $n;
	}

	/** Profiles linked to a deleted (or erased) member. */
	public static function deleteForUser( int $userId ): int {
		global $wpdb;
		if ( $userId <= 0 || ! self::tablesExist() ) {
			return 0;
		}
		$ids = $wpdb->get_col( $wpdb->prepare( 'SELECT subscriber_id FROM ' . self::profiles() . ' WHERE user_id = %d', $userId ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$n   = 0;
		foreach ( (array) $ids as $id ) {
			$n += self::deleteForSubscriber( (int) $id );
		}
		return $n;
	}

	/** @return array<int,int> subscriber ids linked to this member */
	public static function subscribersOfUser( int $userId ): array {
		global $wpdb;
		if ( $userId <= 0 || ! self::tablesExist() ) {
			return array();
		}
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( 'SELECT subscriber_id FROM ' . self::profiles() . ' WHERE user_id = %d', $userId ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	/**
	 * Daily housekeeping: expired requests, never-confirmed profiles, old send records and webhook ids,
	 * profiles whose member or contact is gone.
	 *
	 * @param callable(array<int,int>):array<int,int> $existingContacts subscriber ids that still exist
	 */
	public static function purge( callable $existingContacts ): int {
		global $wpdb;
		if ( ! self::tablesExist() ) {
			return 0;
		}
		$p      = self::profiles();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - self::PENDING_DAYS * DAY_IN_SECONDS );
		$n      = (int) $wpdb->query( $wpdb->prepare( "DELETE FROM {$p} WHERE status = %s AND (pending_at IS NULL OR pending_at < %s)", self::PENDING, $cutoff ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$wpdb->query( $wpdb->prepare( "UPDATE {$p} SET pending_data = NULL, confirm_hash = NULL, pending_at = NULL WHERE status = %s AND pending_at < %s", self::CONFIRMED, $cutoff ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::sent() . ' WHERE created_at < %s', gmdate( 'Y-m-d H:i:s', time() - self::SENT_KEEP_DAYS * DAY_IN_SECONDS ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::events() . ' WHERE created_at < %s', gmdate( 'Y-m-d H:i:s', time() - self::EVENT_KEEP_DAYS * DAY_IN_SECONDS ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		// Member deleted while the plugin was inactive.
		$gone = $wpdb->get_col( "SELECT p.subscriber_id FROM {$p} p LEFT JOIN {$wpdb->users} u ON u.ID = p.user_id WHERE p.user_id > 0 AND u.ID IS NULL" ); // phpcs:ignore WordPress.DB.PreparedSQL
		foreach ( (array) $gone as $id ) {
			$n += self::deleteForSubscriber( (int) $id );
		}
		// Contact deleted in FluentCRM while the plugin was inactive (or FluentCRM removed).
		$all = array_map( 'intval', (array) $wpdb->get_col( "SELECT subscriber_id FROM {$p}" ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		if ( $all ) {
			foreach ( array_diff( $all, $existingContacts( $all ) ) as $id ) {
				$n += self::deleteForSubscriber( (int) $id );
			}
		}
		return $n;
	}
}
