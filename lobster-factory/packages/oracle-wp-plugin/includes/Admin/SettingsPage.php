<?php
/**
 * Settings → AwareWave Oracle. Everything site-specific is entered here (no addresses in code):
 * engine URLs, key id, the site's Ed25519 key (generate / rotate; only the public half is shown),
 * locale map, tool-slug → page map, member-pseudonym salt rotation, tool-list refresh.
 * Capability manage_options on every render and action; every action form carries its own nonce.
 *
 * @package AwareWave\Oracle\Admin
 */

namespace AwareWave\Oracle\Admin;

use AwareWave\Oracle\Crypto\SiteKey;
use AwareWave\Oracle\Engine\EngineClient;
use AwareWave\Oracle\Settings\Normalize;
use AwareWave\Oracle\Settings\Options;

final class SettingsPage {

	const CAP   = 'manage_options';
	const SLUG  = 'aware-wave-oracle';
	const GROUP = 'aworacle';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'registerSetting' ) );
	}

	public function menu(): void {
		add_options_page(
			__( 'AwareWave Oracle', 'aware-wave-oracle' ),
			__( 'AwareWave Oracle', 'aware-wave-oracle' ),
			self::CAP,
			self::SLUG,
			array( $this, 'render' )
		);
	}

	public function registerSetting(): void {
		register_setting(
			self::GROUP,
			Options::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
				'default'           => Options::defaults(),
				'show_in_rest'      => false,
			)
		);
	}

	/**
	 * @param mixed $input
	 * @return array<string,mixed>
	 */
	public function sanitize( $input ): array {
		$old = Options::get();
		if ( ! is_array( $input ) || ! current_user_can( self::CAP ) ) {
			return $old;
		}
		$in  = wp_unslash( $input );
		$out = Options::defaults();

		$out['browser_engine_url'] = Normalize::engineUrl( (string) ( $in['browser_engine_url'] ?? '' ), false );
		if ( $out['browser_engine_url'] === '' && trim( (string) ( $in['browser_engine_url'] ?? '' ) ) !== '' ) {
			add_settings_error( Options::OPTION, 'browser_url', __( 'Engine URL (browser) must be an https:// address without query or fragment.', 'aware-wave-oracle' ) );
		}
		$out['server_engine_url'] = Normalize::engineUrl( (string) ( $in['server_engine_url'] ?? '' ), true );
		if ( $out['server_engine_url'] === '' && trim( (string) ( $in['server_engine_url'] ?? '' ) ) !== '' ) {
			add_settings_error( Options::OPTION, 'server_url', __( 'Engine URL (server) must be an http(s):// address without query or fragment.', 'aware-wave-oracle' ) );
		}
		$out['key_id'] = Normalize::keyId( (string) ( $in['key_id'] ?? '' ) );
		if ( $out['key_id'] === '' && trim( (string) ( $in['key_id'] ?? '' ) ) !== '' ) {
			add_settings_error( Options::OPTION, 'key_id', __( 'Key ID: 3–64 characters, lowercase letters, digits, - and _.', 'aware-wave-oracle' ) );
		}
		$default = Normalize::engineLocale( (string) ( $in['default_locale'] ?? '' ) );
		$out['default_locale'] = $default !== '' ? $default : 'en';

		$rejected          = array();
		$out['locale_map'] = Normalize::pairs( (string) ( $in['locale_map'] ?? '' ), Normalize::WP_LOCALE_PATTERN, Normalize::LOCALE_PATTERN, $rejected );
		$pages             = Normalize::pairs( (string) ( $in['page_map'] ?? '' ), Normalize::SLUG_PATTERN, '/^[1-9][0-9]{0,18}$/', $rejected );
		$out['page_map']   = array_map( 'intval', $pages );
		if ( $rejected ) {
			add_settings_error(
				Options::OPTION,
				'maps',
				/* translators: %s: the lines that were not saved */
				sprintf( __( 'These lines were not saved (wrong format): %s', 'aware-wave-oracle' ), implode( ' | ', $rejected ) )
			);
		}

		if ( Options::serverEngineUrl() !== ( $out['server_engine_url'] !== '' ? $out['server_engine_url'] : $out['browser_engine_url'] ) ) {
			EngineClient::forgetTools();
		}
		return $out;
	}

	public function render(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'aware-wave-oracle' ) );
		}
		$notice = $this->handleActions();
		$s      = Options::get();

		echo '<div class="wrap"><h1>' . esc_html__( 'AwareWave Oracle', 'aware-wave-oracle' ) . '</h1>';
		if ( $notice ) {
			echo '<div class="notice notice-' . esc_attr( $notice[0] ) . '"><p>' . esc_html( $notice[1] ) . '</p></div>';
		}
		settings_errors( Options::OPTION );

		// --- Main settings (Settings API; sanitize() validates) ---
		echo '<form method="post" action="options.php">';
		settings_fields( self::GROUP );
		$name = Options::OPTION;
		echo '<table class="form-table" role="presentation">';
		$this->textRow( $name . '[browser_engine_url]', $s['browser_engine_url'], __( 'Engine URL (browser)', 'aware-wave-oracle' ), __( 'Address visitors’ browsers load the embedded tools from, e.g. https://engine.example.com', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[server_engine_url]', $s['server_engine_url'], __( 'Engine URL (server)', 'aware-wave-oracle' ), __( 'Address this WordPress server calls the engine at. Leave empty to use the browser URL; may be an internal http:// address.', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[key_id]', $s['key_id'], __( 'Key ID', 'aware-wave-oracle' ), __( 'The name this site is registered under at the engine.', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[default_locale]', $s['default_locale'], __( 'Default engine language', 'aware-wave-oracle' ), __( 'Used when the page language has no entry below, e.g. en or zh-TW.', 'aware-wave-oracle' ) );
		$this->areaRow( $name . '[locale_map]', Normalize::pairsToText( $s['locale_map'] ), __( 'Language map', 'aware-wave-oracle' ), __( 'One per line: WordPress locale=engine language, e.g. zh_TW=zh-TW', 'aware-wave-oracle' ) );
		$this->areaRow( $name . '[page_map]', Normalize::pairsToText( $s['page_map'] ), __( 'Tool pages', 'aware-wave-oracle' ), __( 'One per line: tool=page ID. When the embedded tool links to another tool, the visitor goes to that page.', 'aware-wave-oracle' ) );
		echo '</table>';
		submit_button();
		echo '</form>';

		// --- Site key ---
		$keypair = Options::keypair();
		$has     = SiteKey::usable( $keypair );
		echo '<h2>' . esc_html__( 'Site key', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . esc_html__( 'This site signs its requests to the engine with an Ed25519 key. The private half never leaves this site; register the public key below with the engine under the key ID above.', 'aware-wave-oracle' ) . '</p>';
		if ( $has ) {
			echo '<textarea readonly rows="4" class="large-text code" onclick="this.select()">' . esc_textarea( SiteKey::publicKeyPem( $keypair ) ) . '</textarea>';
		} else {
			echo '<p><em>' . esc_html__( 'No key yet.', 'aware-wave-oracle' ) . '</em></p>';
		}
		echo '<form method="post">';
		wp_nonce_field( 'aworacle_key' );
		echo '<input type="hidden" name="aworacle_action" value="key">';
		if ( $has ) {
			echo '<p><label><input type="checkbox" name="aworacle_confirm" value="1"> ' . esc_html__( 'I understand the old key stops working until the new public key is registered at the engine.', 'aware-wave-oracle' ) . '</label></p>';
		}
		submit_button( $has ? __( 'Rotate key', 'aware-wave-oracle' ) : __( 'Generate key', 'aware-wave-oracle' ), $has ? 'secondary' : 'primary', 'submit', false );
		echo '</form>';

		// --- Member pseudonym salt ---
		echo '<h2>' . esc_html__( 'Member pseudonyms', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . esc_html__( 'The engine never sees member IDs or e-mails, only HMAC(salt, user ID). Rotating the salt makes every member look new to the engine (usage limits restart).', 'aware-wave-oracle' ) . '</p>';
		echo '<form method="post">';
		wp_nonce_field( 'aworacle_salt' );
		echo '<input type="hidden" name="aworacle_action" value="salt">';
		echo '<p><label><input type="checkbox" name="aworacle_confirm" value="1"> ' . esc_html__( 'Yes, rotate the salt.', 'aware-wave-oracle' ) . '</label></p>';
		submit_button( __( 'Rotate salt', 'aware-wave-oracle' ), 'secondary', 'submit', false );
		echo '</form>';

		// --- Tool list ---
		$tools = EngineClient::tools();
		echo '<h2>' . esc_html__( 'Tools available from the engine', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . ( $tools ? '<code>' . implode( '</code> <code>', array_map( 'esc_html', $tools ) ) . '</code>' : '<em>' . esc_html__( 'None — check the engine URL.', 'aware-wave-oracle' ) . '</em>' ) . '</p>';
		echo '<p>' . esc_html__( 'Shortcode:', 'aware-wave-oracle' ) . ' <code>[aw_oracle tool="ziwei"]</code></p>';
		echo '<form method="post">';
		wp_nonce_field( 'aworacle_tools' );
		echo '<input type="hidden" name="aworacle_action" value="tools">';
		submit_button( __( 'Refresh tool list', 'aware-wave-oracle' ), 'secondary', 'submit', false );
		echo '</form></div>';
	}

	/** @return array{0:string,1:string}|null [notice type, message] */
	private function handleActions(): ?array {
		if ( ! isset( $_POST['aworacle_action'] ) || ! current_user_can( self::CAP ) ) {
			return null;
		}
		$action  = sanitize_key( wp_unslash( $_POST['aworacle_action'] ) );
		$confirm = isset( $_POST['aworacle_confirm'] ) && $_POST['aworacle_confirm'] === '1';

		if ( $action === 'key' ) {
			check_admin_referer( 'aworacle_key' );
			if ( SiteKey::usable( Options::keypair() ) && ! $confirm ) {
				return array( 'warning', __( 'Tick the confirmation box to rotate the key.', 'aware-wave-oracle' ) );
			}
			update_option( Options::KEY_OPTION, SiteKey::newKeypair(), false );
			return array( 'success', __( 'New key created. Register the public key below at the engine.', 'aware-wave-oracle' ) );
		}
		if ( $action === 'salt' ) {
			check_admin_referer( 'aworacle_salt' );
			if ( ! $confirm ) {
				return array( 'warning', __( 'Tick the confirmation box to rotate the salt.', 'aware-wave-oracle' ) );
			}
			update_option( Options::SALT_OPTION, Options::newSalt(), false );
			return array( 'success', __( 'Salt rotated.', 'aware-wave-oracle' ) );
		}
		if ( $action === 'tools' ) {
			check_admin_referer( 'aworacle_tools' );
			EngineClient::forgetTools();
			return array( 'success', __( 'Tool list refreshed.', 'aware-wave-oracle' ) );
		}
		return null;
	}

	private function textRow( string $name, string $value, string $label, string $help ): void {
		$id = sanitize_key( str_replace( array( '[', ']' ), '_', $name ) );
		echo '<tr><th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th><td>';
		echo '<input type="text" class="regular-text" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '">';
		echo '<p class="description">' . esc_html( $help ) . '</p></td></tr>';
	}

	private function areaRow( string $name, string $value, string $label, string $help ): void {
		$id = sanitize_key( str_replace( array( '[', ']' ), '_', $name ) );
		echo '<tr><th scope="row"><label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label></th><td>';
		echo '<textarea class="large-text code" rows="4" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '">' . esc_textarea( $value ) . '</textarea>';
		echo '<p class="description">' . esc_html( $help ) . '</p></td></tr>';
	}
}
