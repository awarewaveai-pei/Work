<?php
/**
 * Confirmation of one signup request — the only way a request becomes the active letter (invariant 1).
 *  - Mail: wp_mail (the site's mailer: FluentSMTP → Resend), in the subscriber's language, with
 *    <home>/?aworacle_daily_confirm=<subscriber id>.<token>. Not a FluentCRM campaign: FluentCRM would keep the
 *    body (and the token) in fc_campaigns and only mails subscribed contacts.
 *  - GET shows what is being confirmed (birth date and time, birthplace, time zone) and a button; only the
 *    POST confirms, so mail scanners that fetch links subscribe nobody, and the person sees whose data it is.
 *  - POST: the request becomes active (Store::confirm) and the FluentCRM contact becomes subscribed (unless
 *    FluentCRM has it as bounced, complained or spammed — then nothing is mailed anyway).
 * The token is 32 random bytes; only its sha256 is stored; a newer request for the address replaces it;
 * it expires with the request (Store::PENDING_DAYS).
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Settings\Options;

final class Confirm {

	const QUERY = 'aworacle_daily_confirm';
	/** Confirmation mails per UTC day for the whole site (Resend free plan: 100 a day for everything). */
	const DAILY_CAP    = 30;
	const CAP_OPTION   = 'aworacle_daily_confirm_count';

	public function register(): void {
		add_action( 'template_redirect', array( $this, 'handle' ) );
	}

	/** One slot under DAILY_CAP for today (UTC); false when today's mails are used up. */
	public static function takeDailySlot(): bool {
		$today = gmdate( 'Y-m-d' );
		$state = get_option( self::CAP_OPTION );
		$count = ( is_array( $state ) && ( $state['day'] ?? '' ) === $today ) ? (int) $state['count'] : 0;
		if ( $count >= (int) apply_filters( 'aworacle_daily_confirm_cap', self::DAILY_CAP ) ) {
			return false;
		}
		update_option( self::CAP_OPTION, array( 'day' => $today, 'count' => $count + 1 ), false );
		return true;
	}

	public static function mail( string $email, int $subscriberId, string $token, string $locale ): bool {
		$url = add_query_arg( self::QUERY, $subscriberId . '.' . $token, home_url( '/' ) );
		list( $subject, $body ) = Lang::with(
			Runner::WP_LOCALES[ $locale ] ?? 'en_US',
			static function () use ( $url ): array {
				return array(
					__( 'Confirm your daily fortune letter', 'aware-wave-oracle' ),
					'<p>' . esc_html__( 'Someone (hopefully you) asked to receive a daily fortune letter at this address. Open this address and press the button to confirm. If it was not you, ignore this message.', 'aware-wave-oracle' ) . '</p>'
					. '<p style="word-break:break-all"><a href="' . esc_url( $url ) . '">' . esc_html( $url ) . '</a></p>',
				);
			}
		);
		return wp_mail( $email, $subject, $body, array( 'Content-Type: text/html; charset=UTF-8' ) );
	}

	public function handle(): void {
		$raw = isset( $_GET[ self::QUERY ] ) ? sanitize_text_field( wp_unslash( $_GET[ self::QUERY ] ) ) : '';
		if ( $raw === '' ) {
			return;
		}
		nocache_headers();
		$title = __( 'Daily fortune letter', 'aware-wave-oracle' );
		if ( ! preg_match( '/^([1-9][0-9]{0,18})\.([A-Za-z0-9_-]{43})$/', $raw, $m ) ) {
			wp_die( esc_html__( 'This confirmation link is not valid.', 'aware-wave-oracle' ), esc_html( $title ), array( 'response' => 400 ) );
		}
		if ( Runner::offReason() !== '' ) {
			wp_die( esc_html__( 'Subscribing is not available on this site yet.', 'aware-wave-oracle' ), esc_html( $title ), array( 'response' => 503 ) );
		}
		$id  = (int) $m[1];
		$key = Options::dataKey();
		$req = Store::pendingRequest( $id, $m[2], $key );
		if ( $req === null ) {
			wp_die( esc_html__( 'This confirmation link has expired or was already used.', 'aware-wave-oracle' ), esc_html( $title ), array( 'response' => 410 ) );
		}
		if ( ( $_SERVER['REQUEST_METHOD'] ?? 'GET' ) !== 'POST' ) {
			$b    = $req['birth'];
			$what = sprintf(
				'%04d-%02d-%02d %02d:%02d%s · %s · %s',
				(int) $b['year'],
				(int) $b['month'],
				(int) $b['day'],
				(int) $b['hour'],
				(int) $b['minute'],
				$b['calendar'] === 'lunar' ? ' (' . __( 'Lunar', 'aware-wave-oracle' ) . ')' : '',
				(string) ( $b['place']['label'] ?? '' ) !== '' ? (string) $b['place']['label'] : (string) $b['place']['zone'],
				(string) $req['tz']
			);
			$form = '<p>' . esc_html__( 'Press the button to start receiving the daily fortune letter.', 'aware-wave-oracle' ) . '</p>'
				. '<p>' . esc_html__( 'Birth data and time zone you sent:', 'aware-wave-oracle' ) . ' <strong>' . esc_html( $what ) . '</strong></p>'
				. '<form method="post" action="' . esc_url( add_query_arg( self::QUERY, $raw, home_url( '/' ) ) ) . '"><p><button type="submit" class="button wp-element-button">'
				. esc_html__( 'Confirm', 'aware-wave-oracle' ) . '</button></p></form>';
			wp_die( $form, esc_html( $title ), array( 'response' => 200 ) ); // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts
		}
		$done = Store::confirm( $id, $m[2], $key ) && Crm::subscribe( $id );
		wp_die(
			$done
				? esc_html__( 'Confirmed. Your first letter arrives after 07:00 in your time zone.', 'aware-wave-oracle' )
				: esc_html__( 'This confirmation link has expired or was already used.', 'aware-wave-oracle' ),
			esc_html( $title ),
			array( 'response' => $done ? 200 : 410 )
		);
	}
}
