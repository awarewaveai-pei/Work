<?php
/**
 * Member ticket for the engine's AI reading (ORACLE-WP-SPEC §2-7; engine lib/sites/ticket.ts):
 *   POST aworacle/v1/ticket → { ticket, signature, expires_in }
 * ticket = base64url of the signed body {key_id, ts, nonce, aud:"ticket", member}; signature = base64 Ed25519
 * over that body (SiteKey::signedRequest, the only signer). Sent by the framed page as headers
 * X-AwareWave-Oracle-Ticket / X-AwareWave-Oracle-Signature; single use, 60 s.
 * member = Options::memberPseudonym() = HMAC-SHA256(site salt, user id): stable per member, not reversible,
 * no e-mail or id. Login + wp_rest nonce (Members\Rest::permit, 401). At most RATE tickets per member per
 * WINDOW seconds (429). Without a site key the endpoint is 503.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Crypto\SiteKey;
use AwareWave\Oracle\Settings\Options;

final class Ticket {

	const RATE   = 30;
	const WINDOW = 600;

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		register_rest_route(
			Rest::NS,
			'/ticket',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'issue' ),
				'permission_callback' => array( Rest::class, 'permit' ),
			)
		);
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function issue( \WP_REST_Request $request ) {
		$userId = get_current_user_id();
		if ( ! self::takeSlot( $userId ) ) {
			return new \WP_Error( 'aworacle_ticket_rate', __( 'Too many requests. Try again in a few minutes.', 'aware-wave-oracle' ), array( 'status' => 429 ) );
		}
		$member = Options::memberPseudonym( $userId );
		if ( $member === '' ) { // salt could not be created: the engine would refuse an empty member anyway
			return new \WP_Error( 'aworacle_ticket_off', __( 'AI readings for members are not available on this site yet.', 'aware-wave-oracle' ), array( 'status' => 503 ) );
		}
		try {
			$req = SiteKey::signedRequest( array( 'member' => $member ), SiteKey::AUD_TICKET, Options::get()['key_id'], Options::keypair() );
		} catch ( \InvalidArgumentException $e ) {
			return new \WP_Error( 'aworacle_ticket_off', __( 'AI readings for members are not available on this site yet.', 'aware-wave-oracle' ), array( 'status' => 503 ) );
		}
		$res = new \WP_REST_Response(
			array(
				'ticket'     => rtrim( strtr( base64_encode( $req['body'] ), '+/', '-_' ), '=' ),
				'signature'  => $req['headers'][ SiteKey::SIGNATURE_HEADER ],
				'expires_in' => 60,
			),
			200
		);
		$res->header( 'Cache-Control', 'no-store' );
		return $res;
	}

	/** Fixed window per member (user meta: atomic enough for one browser; a race can only add a few). */
	private static function takeSlot( int $userId ): bool {
		$now   = time();
		$state = get_user_meta( $userId, 'aworacle_ticket_window', true );
		$state = is_array( $state ) ? $state : array();
		$start = (int) ( $state['start'] ?? 0 );
		$count = (int) ( $state['count'] ?? 0 );
		if ( $now - $start >= self::WINDOW ) {
			$start = $now;
			$count = 0;
		}
		if ( $count >= self::RATE ) {
			return false;
		}
		update_user_meta(
			$userId,
			'aworacle_ticket_window',
			array(
				'start' => $start,
				'count' => $count + 1,
			)
		);
		return true;
	}
}
