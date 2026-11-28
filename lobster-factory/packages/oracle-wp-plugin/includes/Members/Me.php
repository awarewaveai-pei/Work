<?php
/**
 * "Me": the one saved chart a member marked as their own birth data. Birth data is entered once and lives in
 * one place (an encrypted row in {prefix}aworacle_charts); everything else reads it from here.
 *
 * The mark is one value per member and site (user option aworacle_self_chart = chart id), so there can only be
 * one, and the saved rows are not touched. Reading goes through Store::get, which only ever returns the
 * member's own row.
 *
 * REST aworacle/v1 (login + wp_rest nonce, Members\Rest::permit):
 *   GET  /me            { item: {id, name, birth} | null, email }
 *   PUT  /me            { id } mark one of the member's own charts ({ id: 0 } removes the mark)
 *   POST /me/subscribe  { tz, locale, turnstile } the daily letter to the account's address, from "me",
 *                       through the one signup path (Daily\Rest::accept: same checks, same confirmation mail)
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Daily\Rest as DailyRest;
use AwareWave\Oracle\Settings\Options;

final class Me {

	const OPTION = 'aworacle_self_chart';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			Rest::NS,
			'/me',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'read' ),
					'permission_callback' => array( Rest::class, 'permit' ),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( $this, 'mark' ),
					'permission_callback' => array( Rest::class, 'permit' ),
				),
			)
		);
		register_rest_route(
			Rest::NS,
			'/me/subscribe',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'subscribe' ),
				'permission_callback' => array( Rest::class, 'permit' ),
			)
		);
	}

	/** The marked chart id, or 0. */
	public static function id( int $userId ): int {
		return (int) get_user_option( self::OPTION, $userId );
	}

	/** Marks one of the member's own charts (0 = no mark). False: not a chart of this member. */
	public static function set( int $userId, int $chartId, string $key ): bool {
		if ( $chartId === 0 ) {
			self::forget( $userId );
			return true;
		}
		if ( Store::get( 'charts', $userId, $chartId, $key ) === null ) {
			return false;
		}
		update_user_option( $userId, self::OPTION, $chartId );
		return true;
	}

	public static function forget( int $userId ): void {
		delete_user_option( $userId, self::OPTION );
	}

	/**
	 * The member's own chart, readable with the current key, or null (none, deleted, or locked).
	 *
	 * @return array{id:int,name:string,birth:array<string,mixed>}|null
	 */
	public static function chart( int $userId, string $key ): ?array {
		$id  = self::id( $userId );
		$row = $id > 0 && $key !== '' ? Store::get( 'charts', $userId, $id, $key ) : null;
		if ( ! $row || ! is_array( $row['data']['birth'] ?? null ) ) {
			return null;
		}
		return array(
			'id'    => $row['id'],
			'name'  => (string) ( $row['data']['name'] ?? '' ),
			'birth' => $row['data']['birth'],
		);
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function read( \WP_REST_Request $request ) {
		$user = wp_get_current_user();
		$res  = new \WP_REST_Response(
			array(
				'item'  => self::chart( (int) $user->ID, Options::dataKey() ),
				'email' => (string) $user->user_email,
			),
			200
		);
		$res->header( 'Cache-Control', 'no-store' );
		return $res;
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function mark( \WP_REST_Request $request ) {
		$body = $request->get_json_params();
		$id   = is_array( $body ) ? ( $body['id'] ?? null ) : null;
		if ( ! is_int( $id ) || $id < 0 || ! self::set( get_current_user_id(), $id, Options::dataKey() ) ) {
			return new \WP_Error( 'aworacle_not_found', __( 'Not found.', 'aware-wave-oracle' ), array( 'status' => 404 ) );
		}
		return new \WP_REST_Response( array( 'marked' => $id ), 200 );
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function subscribe( \WP_REST_Request $request ) {
		$user  = wp_get_current_user();
		$chart = self::chart( (int) $user->ID, Options::dataKey() );
		if ( ! $chart ) {
			return new \WP_Error( 'aworacle_me_missing', __( 'Fill in your birth data first.', 'aware-wave-oracle' ), array( 'status' => 409 ) );
		}
		$body   = $request->get_json_params();
		$body   = is_array( $body ) ? $body : array();
		$tz     = is_string( $body['tz'] ?? null ) && Record::isTimeZone( $body['tz'] ) ? $body['tz'] : (string) ( $chart['birth']['place']['zone'] ?? '' );
		$result = DailyRest::accept(
			array(
				'email'     => (string) $user->user_email,
				'tz'        => $tz,
				'locale'    => $body['locale'] ?? '',
				'turnstile' => $body['turnstile'] ?? '',
				'birth'     => $chart['birth'],
			)
		);
		if ( $result instanceof \WP_Error ) {
			return $result;
		}
		// The member's own address: saying that no mail left gives nothing away.
		if ( $result !== DailyRest::ACCEPTED ) {
			return new \WP_Error(
				'aworacle_daily_unsent',
				$result === DailyRest::MAIL_CAP
					? __( 'Today’s confirmation mails are used up. Try again tomorrow.', 'aware-wave-oracle' )
					: __( 'The confirmation mail could not be sent. Try again later.', 'aware-wave-oracle' ),
				array( 'status' => 503 )
			);
		}
		return new \WP_REST_Response( array( 'message' => __( 'Almost done: check your inbox and confirm your e-mail address.', 'aware-wave-oracle' ) ), 202 );
	}
}
