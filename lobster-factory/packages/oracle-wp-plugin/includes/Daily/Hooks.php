<?php
/**
 * Wiring for the daily letter: schedules and FluentCRM events.
 *  - hourly Runner::RUN_HOOK; every 30 days CLEANUP_HOOK (this plugin's one-off campaigns older than 30 days;
 *    a run that does not finish schedules CLEANUP_MORE in 10 minutes until the backlog is gone)
 *  - FluentCRM status → unsubscribed / bounced / complained / spammed: the profile is deleted (never picked
 *    again; signing up again starts from scratch). The send records stay (only subscriber id + date, purged
 *    after Store::SENT_KEEP_DAYS) so re-subscribing on the same day cannot bring a second letter that day.
 *  - contact deleted in FluentCRM: profile and send records deleted.
 * Requests become active only through the plugin's own link (Daily\Confirm), never through FluentCRM's
 * double opt-in, which confirms the contact rather than one request.
 * Housekeeping (expired requests, old records, orphans) runs on Members\Store::PURGE_HOOK (daily).
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Members\Store as MembersStore;

final class Hooks {

	const CLEANUP_HOOK       = 'aworacle_daily_cleanup';
	const CLEANUP_MORE       = 'aworacle_daily_cleanup_more';
	const MONTHLY            = 'aworacle_monthly';
	const CAMPAIGN_KEEP_DAYS = 30;

	public function register(): void {
		add_filter( 'cron_schedules', array( self::class, 'schedules' ) );
		add_action( 'init', array( self::class, 'schedule' ) );
		add_action( Runner::RUN_HOOK, array( self::class, 'run' ) );
		add_action( self::CLEANUP_HOOK, array( self::class, 'cleanup' ) );
		add_action( self::CLEANUP_MORE, array( self::class, 'cleanup' ) );
		add_action( MembersStore::PURGE_HOOK, array( self::class, 'purge' ) );
		foreach ( Crm::SUPPRESSED as $status ) {
			add_action( 'fluentcrm_subscriber_status_to_' . $status, array( self::class, 'onSuppressed' ) );
		}
		add_action( 'fluentcrm_after_subscribers_deleted', array( self::class, 'onContactsDeleted' ) );
	}

	/** @param array<string,array<string,mixed>> $s */
	public static function schedules( $s ): array {
		$s                  = is_array( $s ) ? $s : array();
		$s[ self::MONTHLY ] = array(
			'interval' => 30 * DAY_IN_SECONDS,
			'display'  => 'Every 30 days (AwareWave Oracle)',
		);
		return $s;
	}

	public static function schedule(): void {
		if ( ! wp_next_scheduled( Runner::RUN_HOOK ) ) {
			wp_schedule_event( time() + 60, 'hourly', Runner::RUN_HOOK );
		}
		if ( ! wp_next_scheduled( self::CLEANUP_HOOK ) ) {
			wp_schedule_event( time() + DAY_IN_SECONDS, self::MONTHLY, self::CLEANUP_HOOK );
		}
	}

	public static function unschedule(): void {
		wp_clear_scheduled_hook( Runner::RUN_HOOK );
		wp_clear_scheduled_hook( self::CLEANUP_HOOK );
		wp_clear_scheduled_hook( self::CLEANUP_MORE );
	}

	public static function run(): void {
		Runner::run();
	}

	public static function cleanup(): void {
		list( , $done ) = Crm::deleteOldCampaigns( self::CAMPAIGN_KEEP_DAYS );
		if ( ! $done && ! wp_next_scheduled( self::CLEANUP_MORE ) ) {
			wp_schedule_single_event( time() + 10 * MINUTE_IN_SECONDS, self::CLEANUP_MORE );
		}
	}

	public static function purge(): void {
		Store::purge( array( Crm::class, 'existing' ) );
	}

	/** @param object $subscriber FluentCRM Subscriber */
	public static function onSuppressed( $subscriber ): void {
		if ( is_object( $subscriber ) && isset( $subscriber->id ) ) {
			Store::deleteForSubscriber( (int) $subscriber->id, false );
		}
	}

	/** @param mixed $ids */
	public static function onContactsDeleted( $ids ): void {
		foreach ( (array) $ids as $id ) {
			Store::deleteForSubscriber( (int) $id );
		}
	}
}
