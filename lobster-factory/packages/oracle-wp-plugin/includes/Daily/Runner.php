<?php
/**
 * The hourly run (ORACLE-WP-SPEC §2-8). Triggered by WP-Cron hook RUN_HOOK, which the host's cron fires
 * (README: DISABLE_WP_CRON + `wp cron event run --due-now` every few minutes), not by visitors.
 *
 *   pick (Schedule) → per language, per batch of ≤ 200: claim the (subscriber, local date) rows (Store::claim;
 *   the only gate) → one engine batch → Letter → FluentCRM send.
 *   Engine call failed, result missing or not usable, birth data unreadable, FluentCRM refused: the claim is
 *   released (nothing went out; a later hour may retry today). FluentCRM answered anything else: the row is
 *   kept as "failed" — it may have gone out, and at most one letter per day wins over delivery.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Engine\EngineClient;
use AwareWave\Oracle\Settings\Options;

final class Runner {

	const RUN_HOOK = 'aworacle_daily_run';
	/** Upper bound per run, so one run stays within a cron request; the rest go out in the next hour. */
	const MAX_PER_RUN = 1000;
	const SYSTEM = 'daily';
	const LAST_RUN_OPTION = 'aworacle_daily_last_run';

	/** Engine language → WordPress locale used for the letter's own words. */
	const WP_LOCALES = array(
		'zh-TW' => 'zh_TW',
		'en'    => 'en_US',
	);

	/** Why the daily letter is off on this site, or '' when it is on. */
	public static function offReason(): string {
		if ( Options::get()['mailer'] !== 'fluentcrm' ) {
			return 'mailer';
		}
		if ( ! Crm::available() ) {
			return 'fluentcrm';
		}
		if ( Options::dataKey() === '' ) {
			return 'data_key';
		}
		return '';
	}

	/** @return array{picked:int,sent:int,released:int,failed:int} */
	public static function run( ?int $now = null ): array {
		$stats = array( 'picked' => 0, 'sent' => 0, 'released' => 0, 'failed' => 0 );
		if ( self::offReason() !== '' || ! Store::tablesExist() ) {
			return $stats;
		}
		$now      = $now ?? time();
		$key      = Options::dataKey();
		$profiles = Store::confirmedProfiles();
		$dates    = array();
		foreach ( $profiles as $p ) {
			$d = Schedule::dueDate( $p['tz'], $now );
			if ( $d !== null ) {
				$dates[] = $d;
			}
		}
		$picked = Schedule::pick( $profiles, Crm::statuses( array_column( $profiles, 'subscriber_id' ) ), Store::sentKeys( $dates ), $now );
		$picked = array_slice( $picked, 0, self::MAX_PER_RUN );

		// Group by language (one locale per batch request). Claims are taken one batch at a time, right before
		// that batch is computed and sent: a run that dies midway strands at most one batch for the day.
		$groups = array();
		foreach ( $picked as $pick ) {
			$locale              = isset( self::WP_LOCALES[ $pick['profile']['locale'] ] ) ? $pick['profile']['locale'] : 'en';
			$groups[ $locale ][] = $pick;
		}

		foreach ( $groups as $locale => $picks ) {
			foreach ( array_chunk( $picks, EngineClient::BATCH_MAX ) as $batch ) {
				$chunk = array();
				foreach ( $batch as $pick ) {
					$id   = (int) $pick['profile']['subscriber_id'];
					$date = $pick['date'];
					if ( ! Store::claim( $id, $date ) ) {
						continue; // another run has this one
					}
					++$stats['picked'];
					$birth = \AwareWave\Oracle\Crypto\Vault::open( $pick['profile']['data'], $key, Store::activeContext( $id ) );
					if ( ! is_array( $birth ) ) {
						Store::release( $id, $date );
						++$stats['released'];
						continue;
					}
					$chunk[] = array(
						'id'    => $id,
						'date'  => $date,
						'input' => self::input( $birth, $date ),
					);
				}
				if ( ! $chunk ) {
					continue;
				}
				$results = EngineClient::batch( self::SYSTEM, $locale, array_column( $chunk, 'input' ) );
				$labels  = self::labels( $locale );
				foreach ( $chunk as $i => $item ) {
					$r      = $results[ $i ] ?? null;
					$letter = ( is_array( $r ) && ( $r['ok'] ?? false ) === true ) ? Letter::build( $r['data'] ?? null, $item['date'], $labels ) : null;
					if ( $letter === null ) {
						Store::release( $item['id'], $item['date'] );
						++$stats['released'];
						continue;
					}
					$outcome = Crm::send(
						$item['id'],
						$letter['subject'],
						$letter['html'],
						Crm::SLUG_PREFIX . $item['id'] . '-' . $item['date'],
						'oracle-daily ' . $item['date']
					);
					if ( $outcome === Crm::SENT ) {
						Store::mark( $item['id'], $item['date'], Store::SENT );
						++$stats['sent'];
					} elseif ( $outcome === Crm::REFUSED ) {
						Store::release( $item['id'], $item['date'] );
						++$stats['released'];
					} else {
						Store::mark( $item['id'], $item['date'], Store::FAILED );
						++$stats['failed'];
					}
				}
			}
		}
		// Shown on the settings page: "sent" means handed to FluentCRM's queue; a "released" count that stays
		// up hour after hour means the engine or the data key is failing.
		update_option(
			self::LAST_RUN_OPTION,
			array(
				'at'    => time(),
				'stats' => $stats,
			),
			false
		);
		return $stats;
	}

	/**
	 * The engine's daily input: the stored birth fields plus the subscriber's local date (engine field "date").
	 *
	 * @param array<string,mixed> $birth
	 * @return array<string,mixed>
	 */
	public static function input( array $birth, string $date ): array {
		if ( isset( $birth['place']['label'] ) && $birth['place']['label'] === '' ) {
			unset( $birth['place']['label'] );
		}
		list( $y, $m, $d ) = array_map( 'intval', explode( '-', $date ) );
		$birth['date']       = array(
			'year'  => $y,
			'month' => $m,
			'day'   => $d,
		);
		return $birth;
	}

	/** @return array<string,string> the letter's words in the subscriber's language */
	public static function labels( string $locale ): array {
		return Lang::with( self::WP_LOCALES[ $locale ] ?? 'en_US', array( self::class, 'labelsNow' ) );
	}

	/** @return array<string,string> */
	public static function labelsNow(): array {
		return array(
			/* translators: %s: the date, e.g. 2026-11-23 */
			'subject'        => __( 'Your daily fortune for %s', 'aware-wave-oracle' ),
			'intro'          => __( 'Here is today’s reading, calculated from your birth chart.', 'aware-wave-oracle' ),
			'scores.overall' => __( 'Overall', 'aware-wave-oracle' ),
			'scores.love'    => __( 'Love', 'aware-wave-oracle' ),
			'scores.career'  => __( 'Career', 'aware-wave-oracle' ),
			'scores.wealth'  => __( 'Wealth', 'aware-wave-oracle' ),
			'scores.health'  => __( 'Health', 'aware-wave-oracle' ),
			'luckyColors'    => __( 'Lucky colours:', 'aware-wave-oracle' ),
			'luckyNumbers'   => __( 'Lucky numbers:', 'aware-wave-oracle' ),
			'luckyDirection' => __( 'Lucky direction:', 'aware-wave-oracle' ),
			'yi'             => __( 'Good for:', 'aware-wave-oracle' ),
			'ji'             => __( 'Avoid:', 'aware-wave-oracle' ),
			'footer'         => __( 'You receive this because you subscribed to the daily fortune. Use the unsubscribe link below to stop it.', 'aware-wave-oracle' ),
			'sep'            => _x( ', ', 'list separator in the daily letter', 'aware-wave-oracle' ),
		);
	}
}
