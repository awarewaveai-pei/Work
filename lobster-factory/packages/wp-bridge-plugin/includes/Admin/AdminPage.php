<?php
/**
 * AdminPage — the operator-facing screen: a sidebar menu showing status, one-click key generation,
 * a key list, and a one-click live self-test. This is what makes the headless engine usable without
 * touching SQL or an external signing client.
 *
 * @package AwareWave\WpBridge\Admin
 */

namespace AwareWave\WpBridge\Admin;

use AwareWave\WpBridge\Auth\KeyRecord;
use AwareWave\WpBridge\Auth\NonceCache;
use AwareWave\WpBridge\Auth\SignatureVerifier;
use AwareWave\WpBridge\Auth\WpdbKeyStore;
use AwareWave\WpBridge\Auth\WpdbNonceStore;
use AwareWave\WpBridge\Http\RequestAuthenticator;
use AwareWave\WpBridge\Http\SignedRequest;

final class AdminPage {

	const CAP  = 'manage_options';
	const SLUG = 'aware-wave-bridge';

	/** @var string|null private key (base64) just generated this request — shown ONCE below the form. */
	private $generatedPrivateKey = null;
	/** @var string|null key id just generated. */
	private $generatedKeyId = null;

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
	}

	public function menu(): void {
		add_menu_page(
			'AwareWave Bridge',
			'AwareWave Bridge',
			self::CAP,
			self::SLUG,
			array( $this, 'render' ),
			'dashicons-shield-alt',
			58
		);
	}

	public function render(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Insufficient permissions.' );
		}

		$notice = $this->handleActions();

		global $wpdb;
		$keyStore   = new WpdbKeyStore( $wpdb );
		$nonceStore = new WpdbNonceStore( $wpdb );
		$table      = $wpdb->prefix . 'awbridge_keys';

		echo '<div class="wrap"><h1>AwareWave WP Bridge</h1>';

		if ( $notice ) {
			echo '<div class="notice notice-' . esc_attr( $notice['type'] ) . '"><p>' . wp_kses_post( $notice['html'] ) . '</p></div>';
		}

		// --- Status panel ---
		$crypto = $this->cryptoReady();
		echo '<h2>Status</h2><table class="widefat striped" style="max-width:640px"><tbody>';
		$this->row( 'Version', esc_html( AWBRIDGE_VERSION ) );
		$this->row( 'Crypto ready (Ed25519)', $crypto ? '<b style="color:#118a00">YES</b>' : '<b style="color:#b00">NO</b>' );
		$this->row( 'Native sodium extension', extension_loaded( 'sodium' ) ? 'yes (fast)' : 'no (using WordPress fallback — still works)' );
		$this->row( 'Keys table', $keyStore->hasExpectedColumns() ? 'OK' : 'MISSING COLUMNS' );
		$this->row( 'Nonce table', $nonceStore->hasPrimaryKeyOnNonce() ? 'OK' : 'MISSING PRIMARY KEY' );
		echo '</tbody></table>';

		// --- Generate key ---
		echo '<h2>Generate a key</h2>';
		echo '<p>A key lets an AI / client sign requests to operate this site. The <b>private key</b> is shown ONCE — copy it now; the site only stores the public key.</p>';
		echo '<form method="post">';
		wp_nonce_field( 'awbridge_genkey' );
		echo '<input type="hidden" name="awbridge_action" value="genkey">';
		echo '<table class="form-table"><tr><th>Label (key id)</th><td><input name="key_id" class="regular-text" placeholder="e.g. my-ai-key" required></td></tr>';
		echo '<tr><th>Scope</th><td><select name="scope"><option value="write">write (read + write)</option><option value="read">read only</option></select></td></tr></table>';
		submit_button( 'Generate key' );
		echo '</form>';

		if ( $this->generatedPrivateKey !== null ) {
			echo '<div style="margin-top:8px;padding:14px;border:2px solid #d63638;background:#fff0f0;border-radius:6px;max-width:760px">';
			echo '<p style="margin:0 0 6px;color:#d63638;font-weight:700">⚠️ PRIVATE KEY for <code>' . esc_html( (string) $this->generatedKeyId ) . '</code> — copy it NOW. Shown once, never again.</p>';
			echo '<textarea readonly rows="3" style="width:100%;font-family:monospace;font-size:12px" onclick="this.select()">' . esc_textarea( $this->generatedPrivateKey ) . '</textarea>';
			echo '<p style="margin:6px 0 0;color:#666">Click the box → Ctrl+C → save it in a password manager. The site only keeps the public key.</p>';
			echo '</div>';
		}

		// --- Registered keys ---
		echo '<h2>Registered keys</h2>';
		$rows = $wpdb->get_results( "SELECT key_id, scope, status, created_at FROM `{$table}` ORDER BY created_at DESC", ARRAY_A );
		if ( ! $rows ) {
			echo '<p><em>No keys yet.</em></p>';
		} else {
			echo '<table class="widefat striped" style="max-width:760px"><thead><tr><th>Key ID</th><th>Scope</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>';
			foreach ( $rows as $r ) {
				echo '<tr><td><code>' . esc_html( $r['key_id'] ) . '</code></td><td>' . esc_html( $r['scope'] ) . '</td><td>' . esc_html( $r['status'] ) . '</td><td>' . esc_html( gmdate( 'Y-m-d H:i', (int) $r['created_at'] ) ) . '</td><td>';
				if ( $r['status'] !== 'revoked' ) {
					echo '<form method="post" style="display:inline">';
					wp_nonce_field( 'awbridge_revoke' );
					echo '<input type="hidden" name="awbridge_action" value="revoke"><input type="hidden" name="key_id" value="' . esc_attr( $r['key_id'] ) . '">';
					echo '<button class="button-link-delete" onclick="return confirm(\'Revoke this key?\')">Revoke</button></form>';
				}
				echo '</td></tr>';
			}
			echo '</tbody></table>';
		}

		// --- Self test ---
		echo '<h2>Live self-test</h2>';
		echo '<p>Runs a real signed request through the full pipeline (key → Ed25519 signature → nonce → authorize) as a <b>dry-run</b> (nothing on your site is changed). Proves the bridge actually works on this host.</p>';
		echo '<form method="post">';
		wp_nonce_field( 'awbridge_selftest' );
		echo '<input type="hidden" name="awbridge_action" value="selftest">';
		submit_button( 'Run live self-test', 'secondary' );
		echo '</form>';

		echo '</div>';
	}

	/** @return array{type:string,html:string}|null */
	private function handleActions(): ?array {
		if ( ! isset( $_POST['awbridge_action'] ) || ! current_user_can( self::CAP ) ) {
			return null;
		}
		$action = sanitize_text_field( wp_unslash( $_POST['awbridge_action'] ) );

		if ( $action === 'genkey' ) {
			check_admin_referer( 'awbridge_genkey' );
			return $this->generateKey();
		}
		if ( $action === 'revoke' ) {
			check_admin_referer( 'awbridge_revoke' );
			return $this->revokeKey();
		}
		if ( $action === 'selftest' ) {
			check_admin_referer( 'awbridge_selftest' );
			return $this->selfTest();
		}
		return null;
	}

	/** @return array{type:string,html:string} */
	private function generateKey(): array {
		global $wpdb;
		$keyId = sanitize_text_field( wp_unslash( $_POST['key_id'] ?? '' ) );
		$scope = ( ( $_POST['scope'] ?? 'write' ) === 'read' ) ? 'read' : 'write';
		if ( $keyId === '' || ! preg_match( '/^[A-Za-z0-9_\-]{1,191}$/', $keyId ) ) {
			return array( 'type' => 'error', 'html' => 'Invalid key id (letters, numbers, _ - only).' );
		}
		if ( ! function_exists( 'sodium_crypto_sign_keypair' ) ) {
			return array( 'type' => 'error', 'html' => 'Crypto unavailable on this host.' );
		}
		$kp      = sodium_crypto_sign_keypair();
		$public  = base64_encode( sodium_crypto_sign_publickey( $kp ) );
		$private = base64_encode( sodium_crypto_sign_secretkey( $kp ) );

		$ok = $wpdb->insert(
			$wpdb->prefix . 'awbridge_keys',
			array( 'key_id' => $keyId, 'public_key' => $public, 'scope' => $scope, 'status' => 'active', 'ip_allowlist' => null, 'created_at' => time() ),
			array( '%s', '%s', '%s', '%s', '%s', '%d' )
		);
		if ( ! $ok ) {
			return array( 'type' => 'error', 'html' => 'Could not save key (duplicate id?).' );
		}
		// Stash for prominent display right below the Generate button (see render()).
		$this->generatedPrivateKey = $private;
		$this->generatedKeyId      = $keyId;
		return array( 'type' => 'success', 'html' => 'Key <code>' . esc_html( $keyId ) . '</code> created — see the private key below. ⬇' );
	}

	/** @return array{type:string,html:string} */
	private function revokeKey(): array {
		global $wpdb;
		$keyId = sanitize_text_field( wp_unslash( $_POST['key_id'] ?? '' ) );
		$wpdb->update( $wpdb->prefix . 'awbridge_keys', array( 'status' => 'revoked' ), array( 'key_id' => $keyId ), array( '%s' ), array( '%s' ) );
		return array( 'type' => 'success', 'html' => 'Key <code>' . esc_html( $keyId ) . '</code> revoked.' );
	}

	/** @return array{type:string,html:string} */
	private function selfTest(): array {
		global $wpdb;
		if ( ! function_exists( 'sodium_crypto_sign_keypair' ) ) {
			return array( 'type' => 'error', 'html' => 'Crypto unavailable on this host.' );
		}
		// Ephemeral key, registered just for this test, removed after.
		$kp     = sodium_crypto_sign_keypair();
		$public = base64_encode( sodium_crypto_sign_publickey( $kp ) );
		$secret = sodium_crypto_sign_secretkey( $kp );
		$keyId  = 'selftest-' . time();
		$wpdb->insert(
			$wpdb->prefix . 'awbridge_keys',
			array( 'key_id' => $keyId, 'public_key' => $public, 'scope' => 'write', 'status' => 'active', 'ip_allowlist' => null, 'created_at' => time() ),
			array( '%s', '%s', '%s', '%s', '%s', '%d' )
		);

		$now       = time();
		$path      = '/' . AWBRIDGE_REST_NAMESPACE . '/option/blogname';
		$body      = wp_json_encode( array( 'value' => 'selftest' ) );
		$nonce     = 'selftest-' . $now . '-' . wp_generate_password( 6, false );
		$verifier  = new SignatureVerifier();
		$canonical = $verifier->canonicalString( 'POST', $path, $now, $nonce, $body );
		$signature = base64_encode( sodium_crypto_sign_detached( $canonical, $secret ) );

		$req  = new SignedRequest( $keyId, 'POST', $path, $now, $nonce, $body, $signature, $this->clientIp() );
		$auth = new RequestAuthenticator( new WpdbKeyStore( $wpdb ), $verifier, new NonceCache( new WpdbNonceStore( $wpdb ) ) );
		$res  = $auth->authenticate( $req, KeyRecord::SCOPE_WRITE, $now );

		$wpdb->delete( $wpdb->prefix . 'awbridge_keys', array( 'key_id' => $keyId ), array( '%s' ) );

		if ( $res->authenticated() ) {
			return array(
				'type' => 'success',
				'html' => '<b style="color:#118a00">✅ Self-test PASSED.</b> The bridge generated a key, signed a real request with Ed25519, and the server verified the signature + nonce + scope on THIS host (key id <code>' . esc_html( $res->keyId() ) . '</code>, scope ' . esc_html( (string) $res->scope() ) . '). Signed AI control works here.',
			);
		}
		return array(
			'type' => 'error',
			'html' => 'Self-test failed: ' . esc_html( $res->reason() ) . ' (audit: ' . esc_html( $res->auditReason() ) . '). Crypto ready: ' . ( $this->cryptoReady() ? 'yes' : 'no' ) . '.',
		);
	}

	private function cryptoReady(): bool {
		if ( ! function_exists( 'sodium_crypto_sign_keypair' ) ) {
			return false;
		}
		try {
			$kp = sodium_crypto_sign_keypair();
			$s  = sodium_crypto_sign_detached( 'x', sodium_crypto_sign_secretkey( $kp ) );
			return sodium_crypto_sign_verify_detached( $s, 'x', sodium_crypto_sign_publickey( $kp ) );
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	private function clientIp(): string {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '127.0.0.1';
	}

	private function row( string $label, string $valueHtml ): void {
		echo '<tr><td style="width:240px"><strong>' . esc_html( $label ) . '</strong></td><td>' . wp_kses_post( $valueHtml ) . '</td></tr>';
	}
}
