<?php
/**
 * RestController — the WordPress REST glue. The ONLY WP-coupled part of the request path: it parses
 * headers/body/peer into a SignedRequest, runs the WP-free RequestAuthenticator, and on success
 * dispatches a concrete Operation through the WP-free WriteTransaction. All the security + self-heal
 * logic lives in the tested core; this file only wires WP to it.
 *
 * Wire protocol (headers):
 *   X-AWBridge-Key-Id, X-AWBridge-Timestamp, X-AWBridge-Nonce, X-AWBridge-Signature
 * The signature is Ed25519 over: METHOD \n PATH \n TIMESTAMP \n NONCE \n sha256(rawBody)
 * where PATH is the full REST route, e.g. /aware-wave-bridge/v1/option/blogname.
 *
 * @package AwareWave\WpBridge\Http
 */

namespace AwareWave\WpBridge\Http;

use AwareWave\WpBridge\Auth\KeyRecord;
use AwareWave\WpBridge\Auth\NonceCache;
use AwareWave\WpBridge\Auth\SignatureVerifier;
use AwareWave\WpBridge\Auth\WpdbKeyStore;
use AwareWave\WpBridge\Auth\WpdbNonceStore;
use AwareWave\WpBridge\Operation\SetOptionOperation;
use AwareWave\WpBridge\Transaction\Impl\HttpRenderer;
use AwareWave\WpBridge\Transaction\Impl\NullCachePurger;
use AwareWave\WpBridge\Transaction\Impl\OptionSnapshotter;
use AwareWave\WpBridge\Transaction\TransactionResult;
use AwareWave\WpBridge\Transaction\WriteTransaction;

final class RestController {

	public function register(): void {
		register_rest_route(
			AWBRIDGE_REST_NAMESPACE,
			'/health',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( $this, 'health' ),
			)
		);

		register_rest_route(
			AWBRIDGE_REST_NAMESPACE,
			'/option/(?P<name>[A-Za-z0-9_\-]+)',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true', // auth is enforced inside (signature-based, not WP cookies)
				'callback'            => array( $this, 'setOption' ),
			)
		);
	}

	/** Public health probe: version, sodium, table integrity, server time (for clock-skew diagnosis). */
	public function health( $request ) {
		global $wpdb;
		$keyStore   = new WpdbKeyStore( $wpdb );
		$nonceStore = new WpdbNonceStore( $wpdb );

		return new \WP_REST_Response(
			array(
				'name'        => 'aware-wave-wp-bridge',
				'version'     => AWBRIDGE_VERSION,
				'sodium'      => extension_loaded( 'sodium' ),
				'server_time' => time(),
				'schema'      => array(
					'keys_ok'   => $keyStore->hasExpectedColumns(),
					'nonces_pk' => $nonceStore->hasPrimaryKeyOnNonce(),
				),
			),
			200
		);
	}

	public function setOption( $request ) {
		$auth = $this->authenticate( $request, KeyRecord::SCOPE_WRITE );
		if ( ! $auth->authenticated() ) {
			$this->audit( 'auth_denied', array( 'reason' => $auth->auditReason() ) );
			return new \WP_REST_Response( array( 'ok' => false, 'error' => $auth->reason() ), $auth->httpStatus() );
		}

		$name    = (string) $request->get_param( 'name' );
		$payload = json_decode( (string) $request->get_body(), true );
		if ( ! is_array( $payload ) || ! array_key_exists( 'value', $payload ) ) {
			return new \WP_REST_Response( array( 'ok' => false, 'error' => 'invalid_payload' ), 400 );
		}

		$affected = ( isset( $payload['affectedUrls'] ) && is_array( $payload['affectedUrls'] ) && $payload['affectedUrls'] !== array() )
			? array_values( array_filter( $payload['affectedUrls'], 'is_string' ) )
			: array( home_url( '/' ) );

		$op     = new SetOptionOperation( $name, $payload['value'], $affected );
		$dryRun = ( $request->get_param( 'dry_run' ) === 'true' );

		$tx     = new WriteTransaction( new OptionSnapshotter(), new HttpRenderer(), new NullCachePurger() );
		$result = $tx->execute( $op, $dryRun );

		$this->audit(
			'option_write',
			array( 'key' => $auth->keyId(), 'option' => $name, 'status' => $result->status(), 'reason' => $result->reason() )
		);

		return new \WP_REST_Response( $this->envelope( $result ), $this->statusFor( $result ) );
	}

	private function authenticate( $request, string $requiredScope ): AuthResult {
		global $wpdb;
		$authenticator = new RequestAuthenticator(
			new WpdbKeyStore( $wpdb ),
			new SignatureVerifier(),
			new NonceCache( new WpdbNonceStore( $wpdb ) )
		);

		$req = new SignedRequest(
			(string) $request->get_header( 'x_awbridge_key_id' ),
			(string) $request->get_method(),
			(string) $request->get_route(),
			(int) $request->get_header( 'x_awbridge_timestamp' ),
			(string) $request->get_header( 'x_awbridge_nonce' ),
			(string) $request->get_body(),
			(string) $request->get_header( 'x_awbridge_signature' ),
			$this->clientIp()
		);

		return $authenticator->authenticate( $req, $requiredScope, time() );
	}

	/** Verified peer address. CONTRACT: never trust a raw client header here (see SignedRequest). */
	private function clientIp(): string {
		// REMOTE_ADDR is the connection peer. Behind the Cloudflare front this becomes CF-Connecting-IP
		// validated against Cloudflare ranges — a deliberate later addition, not a raw XFF read.
		return isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
	}

	/** @return array<string,mixed> */
	private function envelope( TransactionResult $r ): array {
		return array(
			'ok'                 => $r->isCommitted(),
			'status'             => $r->status(),
			'reason'             => $r->reason(),
			'render_hash_before' => $r->renderHashBefore(),
			'render_hash_after'  => $r->renderHashAfter(),
			'purged_urls'        => $r->purgedUrls(),
			'detail'             => $r->detail(),
		);
	}

	private function statusFor( TransactionResult $r ): int {
		switch ( $r->status() ) {
			case TransactionResult::COMMITTED:
			case TransactionResult::DRY_RUN:
				return 200;
			case TransactionResult::ROLLED_BACK:
				return 409;
			case TransactionResult::UNVERIFIABLE:
				return 422;
			case TransactionResult::BLOCKED_IRREVERSIBLE:
				return 403;
			default: // ROLLBACK_FAILED
				return 500;
		}
	}

	/** @param array<string,mixed> $data */
	private function audit( string $event, array $data ): void {
		// Minimal append-only audit to the PHP error log for now; a structured EventLog table is a
		// later brick. auditReason (precise) lands here, never on the wire.
		error_log( '[awbridge] ' . $event . ' ' . wp_json_encode( $data ) );
	}
}
