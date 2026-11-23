<?php
/**
 * REST for the daily letter (ORACLE-WP-SPEC §2-8, §2-10):
 *   POST aworacle/v1/daily/subscribe       public signup form → pending request + confirmation mail
 *   POST aworacle/v1/daily/resend-webhook  Resend email.bounced / email.complained (Svix-signed)
 *
 * Signup answers the same 202 whatever state the address is in (no way to learn who is subscribed), and
 * never mails an address FluentCRM has as bounced, complained or spammed. Abuse limits: per source address
 * (IP_LIMIT an hour; REMOTE_ADDR must be the visitor — README), per contact (one request per
 * THROTTLE_SECONDS) and site-wide (Confirm::DAILY_CAP confirmation mails a day, so a flood of signups cannot
 * use up the sending quota the letters need).
 *
 * Webhook: a failed signature (or no secret configured) is 401 and changes nothing. Each Svix message id is
 * handled once (Store::takeEvent); a redelivery is 200 without doing anything; not ready → 503 (retried).
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Embed\EmbedUrl;
use AwareWave\Oracle\Members\Record;
use AwareWave\Oracle\Members\Rest as MembersRest;
use AwareWave\Oracle\Settings\Options;

final class Rest {

	const IP_LIMIT         = 5;
	const THROTTLE_SECONDS = 600;
	const EMAIL_MAX        = 190;

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			MembersRest::NS,
			'/daily/subscribe',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'subscribe' ),
				'permission_callback' => '__return_true', // public form; limits and double opt-in below
			)
		);
		register_rest_route(
			MembersRest::NS,
			'/daily/resend-webhook',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'webhook' ),
				'permission_callback' => '__return_true', // authenticated by the Svix signature in the handler
			)
		);
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function subscribe( \WP_REST_Request $request ) {
		$off = Runner::offReason();
		if ( $off !== '' ) {
			return new \WP_Error( 'aworacle_daily_off', __( 'Subscribing is not available on this site yet.', 'aware-wave-oracle' ), array( 'status' => 503 ) );
		}
		$ok   = new \WP_REST_Response( array( 'message' => __( 'Almost done: check your inbox and confirm your e-mail address.', 'aware-wave-oracle' ) ), 202 );
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return self::invalid( array( 'body' ) );
		}
		if ( ! empty( $body['website'] ) ) {
			return $ok; // honeypot: bots fill every field
		}
		if ( ! self::takeIpSlot() ) {
			return new \WP_Error( 'aworacle_daily_rate', __( 'Too many requests. Try again in an hour.', 'aware-wave-oracle' ), array( 'status' => 429 ) );
		}

		$errors = array();
		$email  = is_string( $body['email'] ?? null ) ? strtolower( trim( $body['email'] ) ) : '';
		if ( $email === '' || strlen( $email ) > self::EMAIL_MAX || ! is_email( $email ) ) {
			$errors[] = 'email';
		}
		$tz = is_string( $body['tz'] ?? null ) ? trim( $body['tz'] ) : '';
		if ( ! Record::isTimeZone( $tz ) ) {
			$errors[] = 'tz';
		}
		$locale = in_array( $body['locale'] ?? '', EmbedUrl::ENGINE_LOCALES, true ) ? $body['locale'] : EmbedUrl::FALLBACK_LOCALE;
		$birth  = Record::cleanBirth( $body['birth'] ?? null, $errors );
		if ( $errors || $birth === null ) {
			return self::invalid( $errors );
		}

		$existing = Crm::findByEmail( $email );
		if ( $existing && in_array( $existing['status'], array( 'bounced', 'complained', 'spammed' ), true ) ) {
			return $ok;
		}
		$contact = ( $existing && $existing['status'] === 'subscribed' ) ? $existing : Crm::upsertPending( $email );
		if ( ! $contact ) {
			return new \WP_Error( 'aworacle_daily_failed', __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' ), array( 'status' => 500 ) );
		}

		$user   = wp_get_current_user();
		$userId = ( $user && $user->ID && strtolower( (string) $user->user_email ) === $email ) ? (int) $user->ID : 0;
		$req    = array(
			'birth'  => $birth,
			'tz'     => $tz,
			'locale' => $locale,
		);
		// One confirmation path for every request (new, pending, unsubscribed or subscribed contact): the plugin's
		// own single-use link for THIS request. FluentCRM's double opt-in confirms the contact, not the request
		// (a GET that mail scanners follow, valid for any later form) — it is not used.
		$token = rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' );
		// Site-wide cap reached: the request is kept (it expires unconfirmed) but no mail goes out today.
		if ( Store::savePending( $contact['id'], $userId, $req, Options::dataKey(), hash( 'sha256', $token ), self::THROTTLE_SECONDS ) && Confirm::takeDailySlot() ) {
			Confirm::mail( $contact['email'], $contact['id'], $token, $locale );
		}
		return $ok;
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function webhook( \WP_REST_Request $request ) {
		$id  = (string) $request->get_header( 'svix-id' );
		$ok  = Svix::verify(
			Options::webhookSecret(),
			$id,
			(string) $request->get_header( 'svix-timestamp' ),
			(string) $request->get_header( 'svix-signature' ),
			$request->get_body(),
			time()
		);
		if ( ! $ok ) {
			return new \WP_Error( 'aworacle_bad_signature', 'invalid signature', array( 'status' => 401 ) );
		}
		$event  = json_decode( $request->get_body(), true );
		$type   = is_array( $event ) ? ( $event['type'] ?? '' ) : '';
		$status = array(
			'email.bounced'    => 'bounced',
			'email.complained' => 'complained',
		)[ $type ] ?? '';
		// Only a permanent bounce suppresses (Resend data.bounce.type: Permanent | Transient | Undetermined;
		// https://resend.com/docs/dashboard/emails/email-bounces). A full mailbox must not end the subscription.
		if ( $status === 'bounced' && ( $event['data']['bounce']['type'] ?? '' ) !== 'Permanent' ) {
			$status = '';
		}
		if ( $status === '' ) {
			return new \WP_REST_Response( array( 'ignored' => true ), 200 );
		}
		// Cannot act now (tables missing, FluentCRM inactive): 503 without consuming the id, so Resend retries.
		if ( ! Store::tablesExist() || ! Crm::available() ) {
			return new \WP_Error( 'aworacle_webhook_unavailable', 'not ready', array( 'status' => 503 ) );
		}
		if ( ! Store::takeEvent( $id ) ) {
			return new \WP_REST_Response( array( 'duplicate' => true ), 200 );
		}
		$to = $event['data']['to'] ?? array();
		$to = is_string( $to ) ? array( $to ) : ( is_array( $to ) ? $to : array() );
		$n  = 0;
		try {
			foreach ( $to as $addr ) {
				if ( is_string( $addr ) && is_email( trim( $addr ) ) && Crm::suppress( strtolower( trim( $addr ) ), $status ) ) {
					++$n;
				}
			}
		} catch ( \Throwable $e ) {
			Store::forgetEvent( $id ); // let Resend's retry run it again
			return new \WP_Error( 'aworacle_webhook_failed', 'handler failed', array( 'status' => 500 ) );
		}
		return new \WP_REST_Response( array( 'handled' => $n ), 200 );
	}

	/** @param array<int,string> $fields */
	private static function invalid( array $fields ): \WP_Error {
		return new \WP_Error(
			'aworacle_invalid',
			__( 'Some fields are missing or not valid.', 'aware-wave-oracle' ),
			array(
				'status' => 400,
				'fields' => array_values( array_unique( $fields ) ),
			)
		);
	}

	/** At most IP_LIMIT signups an hour from one source address (REMOTE_ADDR; the reverse proxy sets it). */
	private static function takeIpSlot(): bool {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
		$key = 'aworacle_daily_ip_' . md5( $ip );
		$n   = (int) get_transient( $key );
		if ( $n >= self::IP_LIMIT ) {
			return false;
		}
		set_transient( $key, $n + 1, HOUR_IN_SECONDS );
		return true;
	}
}
