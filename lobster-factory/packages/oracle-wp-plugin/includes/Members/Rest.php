<?php
/**
 * REST aworacle/v1 for members' saved charts and persons (ORACLE-WP-SPEC §2-5):
 *   GET  /aworacle/v1/{charts|persons}          the member's list
 *   POST /aworacle/v1/{charts|persons}          { name, birth } → 201 the new item
 *   GET|PUT|DELETE /aworacle/v1/{kind}/{id}      one item of the member; anyone else's id is 404
 *
 * Access: logged in AND a valid wp_rest nonce (X-WP-Nonce header or _wpnonce), checked here — not left to
 * WordPress's cookie check, which other plugins can switch off or bypass. Both failures are 401. On multisite
 * the member must also belong to this site (network-wide login cookies would otherwise let any network
 * user store rows here that no per-site deletion ever reaches): 403.
 * Saving off (no AWORACLE_DATA_KEY) → 503; nothing is ever stored or read in plaintext.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Settings\Options;

final class Rest {

	const NS = 'aworacle/v1';

	public function register(): void {
		add_action( 'rest_api_init', array( $this, 'routes' ) );
	}

	public function routes(): void {
		$kind = '(?P<kind>charts|persons)';
		register_rest_route(
			self::NS,
			'/' . $kind,
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'listItems' ),
					'permission_callback' => array( self::class, 'permit' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'createItem' ),
					'permission_callback' => array( self::class, 'permit' ),
				),
			)
		);
		register_rest_route(
			self::NS,
			'/' . $kind . '/(?P<id>[1-9][0-9]{0,18})',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( $this, 'getItem' ),
					'permission_callback' => array( self::class, 'permit' ),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( $this, 'updateItem' ),
					'permission_callback' => array( self::class, 'permit' ),
				),
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'deleteItem' ),
					'permission_callback' => array( self::class, 'permit' ),
				),
			)
		);
	}

	/** @return true|\WP_Error */
	public static function permit( \WP_REST_Request $request ) {
		if ( ! is_user_logged_in() ) {
			return new \WP_Error( 'aworacle_login_required', __( 'Log in to save.', 'aware-wave-oracle' ), array( 'status' => 401 ) );
		}
		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! is_string( $nonce ) || $nonce === '' ) {
			$nonce = $request->get_param( '_wpnonce' );
		}
		if ( ! is_string( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new \WP_Error( 'aworacle_bad_nonce', __( 'Your session expired. Reload the page and try again.', 'aware-wave-oracle' ), array( 'status' => 401 ) );
		}
		if ( is_multisite() && ! is_user_member_of_blog( get_current_user_id(), get_current_blog_id() ) ) {
			return new \WP_Error( 'aworacle_not_member', __( 'Saving is for members of this site.', 'aware-wave-oracle' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function listItems( \WP_REST_Request $request ) {
		$key = self::keyOrError();
		if ( $key instanceof \WP_Error ) {
			return $key;
		}
		$kind  = (string) $request['kind'];
		$items = array_map( array( self::class, 'item' ), Store::listFor( $kind, get_current_user_id(), $key ) );
		return new \WP_REST_Response(
			array(
				'items' => $items,
				'limit' => Store::limit( $kind ),
			),
			200
		);
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function getItem( \WP_REST_Request $request ) {
		$key = self::keyOrError();
		if ( $key instanceof \WP_Error ) {
			return $key;
		}
		$row = Store::get( (string) $request['kind'], get_current_user_id(), (int) $request['id'], $key );
		return $row ? new \WP_REST_Response( self::item( $row ), 200 ) : self::notFound();
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function createItem( \WP_REST_Request $request ) {
		$key = self::keyOrError();
		if ( $key instanceof \WP_Error ) {
			return $key;
		}
		$data = self::cleanBody( $request );
		if ( $data instanceof \WP_Error ) {
			return $data;
		}
		$kind   = (string) $request['kind'];
		$userId = get_current_user_id();
		$id     = Store::create( $kind, $userId, $data, $key );
		if ( $id === Store::WRITE_FAILED ) {
			return new \WP_Error( 'aworacle_write_failed', __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' ), array( 'status' => 500 ) );
		}
		if ( $id === Store::AT_LIMIT ) {
			return new \WP_Error(
				'aworacle_limit',
				/* translators: %d: how many entries a member may keep */
				sprintf( __( 'You can keep up to %d entries here. Delete one first.', 'aware-wave-oracle' ), Store::limit( $kind ) ),
				array( 'status' => 409 )
			);
		}
		$row = Store::get( $kind, $userId, $id, $key );
		return $row ? new \WP_REST_Response( self::item( $row ), 201 ) : self::notFound();
	}

	/** @return \WP_REST_Response|\WP_Error */
	public function updateItem( \WP_REST_Request $request ) {
		$key = self::keyOrError();
		if ( $key instanceof \WP_Error ) {
			return $key;
		}
		$data = self::cleanBody( $request );
		if ( $data instanceof \WP_Error ) {
			return $data;
		}
		$kind   = (string) $request['kind'];
		$userId = get_current_user_id();
		$id     = (int) $request['id'];
		if ( ! Store::update( $kind, $userId, $id, $data, $key ) ) {
			return self::notFound();
		}
		$row = Store::get( $kind, $userId, $id, $key );
		return $row ? new \WP_REST_Response( self::item( $row ), 200 ) : self::notFound();
	}

	/** Deleting needs no key: a member can always remove rows, even ones the current key cannot open. */
	public function deleteItem( \WP_REST_Request $request ) {
		if ( ! Store::delete( (string) $request['kind'], get_current_user_id(), (int) $request['id'] ) ) {
			return self::notFound();
		}
		return new \WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	/** @return string|\WP_Error */
	private static function keyOrError() {
		$key = Options::dataKey();
		if ( $key === '' ) {
			return new \WP_Error( 'aworacle_storage_off', __( 'Saving is not available on this site yet.', 'aware-wave-oracle' ), array( 'status' => 503 ) );
		}
		return $key;
	}

	/** @return array<string,mixed>|\WP_Error */
	private static function cleanBody( \WP_REST_Request $request ) {
		$errors = array();
		$data   = Record::clean( $request->get_json_params(), $errors );
		if ( $data === null ) {
			return new \WP_Error(
				'aworacle_invalid',
				__( 'Some fields are missing or not valid.', 'aware-wave-oracle' ),
				array(
					'status' => 400,
					'fields' => $errors,
				)
			);
		}
		return $data;
	}

	private static function notFound(): \WP_Error {
		return new \WP_Error( 'aworacle_not_found', __( 'Not found.', 'aware-wave-oracle' ), array( 'status' => 404 ) );
	}

	/**
	 * @param array{id:int,data:array<string,mixed>|null,created_at:string,updated_at:string} $row
	 * @return array<string,mixed>
	 */
	private static function item( array $row ): array {
		$out = array(
			'id'         => $row['id'],
			'locked'     => $row['data'] === null,
			'created_at' => $row['created_at'],
			'updated_at' => $row['updated_at'],
		);
		if ( $row['data'] !== null ) {
			$out['name']  = $row['data']['name'] ?? '';
			$out['birth'] = $row['data']['birth'] ?? null;
		}
		return $out;
	}
}
