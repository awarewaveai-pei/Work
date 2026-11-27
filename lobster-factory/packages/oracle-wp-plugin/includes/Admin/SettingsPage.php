<?php
/**
 * Settings → AwareWave Oracle. Everything site-specific is entered here (no addresses in code):
 * embed mode, engine URLs, key id, the site's Ed25519 key (generate / rotate; only the public half is
 * shown), locale map, tool-slug → page map, member-pseudonym salt rotation, tool-list refresh.
 * Capability manage_options on every render and action; every action form carries its own nonce.
 * Key / salt / tool-list / Turnstile-secret actions post to admin-post.php and redirect back (Post/Redirect/Get), so a
 * browser refresh never repeats them.
 *
 * @package AwareWave\Oracle\Admin
 */

namespace AwareWave\Oracle\Admin;

use AwareWave\Oracle\Crypto\SiteKey;
use AwareWave\Oracle\Crypto\Vault;
use AwareWave\Oracle\Daily\Turnstile;
use AwareWave\Oracle\Engine\EngineClient;
use AwareWave\Oracle\Settings\Normalize;
use AwareWave\Oracle\Settings\Options;

final class SettingsPage {

	const CAP    = 'manage_options';
	const SLUG   = 'aware-wave-oracle';
	const GROUP  = 'aworacle';
	const ACTION = 'aworacle_action';
	const NOTICE = 'aworacle_notice';

	/** @var array<string,bool> settings-error codes already added in this request (sanitize runs twice on the first save) */
	private $reported = array();

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'registerSetting' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handleAction' ) );
		add_action( 'admin_notices', array( $this, 'storageNotice' ) );
		add_action( 'admin_notices', array( $this, 'turnstileNotice' ) );
		// The notice is shown once; WordPress then strips the code from the address bar.
		add_filter(
			'removable_query_args',
			function ( $args ) {
				$args[] = self::NOTICE;
				return $args;
			}
		);
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
	 * @param mixed $input form post (first pass) or the already-sanitized array (second pass on the first save)
	 * @return array<string,mixed>
	 */
	public function sanitize( $input ): array {
		$old = Options::get();
		if ( ! is_array( $input ) || ! current_user_can( self::CAP ) ) {
			return $old;
		}
		$errors = array();
		$out    = Normalize::settings( wp_unslash( $input ), $errors );
		foreach ( $errors as $e ) {
			$this->report( $e[0], $this->errorMessage( $e[0], $e[1] ) );
		}
		if ( $out['embed'] === Normalize::EMBED_SAME_ORIGIN ) {
			$this->warnEnginePrefixes();
		}
		// The tool-list cache needs no clearing here: it is keyed by the engine address (EngineClient::tools).
		return $out;
	}

	private function report( string $code, string $message, string $type = 'error' ): void {
		if ( isset( $this->reported[ $code ] ) ) {
			return;
		}
		$this->reported[ $code ] = true;
		add_settings_error( Options::OPTION, $code, $message, $type );
	}

	/** Messages are HTML (settings_errors prints them as-is): every piece of input is escaped here. */
	private function errorMessage( string $code, string $detail ): string {
		switch ( $code ) {
			case 'browser_url':
				return esc_html__( 'Engine URL (browser) must be an https:// address without query or fragment.', 'aware-wave-oracle' );
			case 'server_url':
				return esc_html__( 'Engine URL (server) must be an http(s):// address without query or fragment.', 'aware-wave-oracle' );
			case 'key_id':
				return esc_html__( 'Key ID: 2–24 characters, lowercase letters, digits and -, starting with a letter or digit.', 'aware-wave-oracle' );
			case 'default_locale':
				return esc_html__( 'Default engine language must be zh-TW or en; en was saved.', 'aware-wave-oracle' );
			case 'turnstile_site_key':
				return esc_html__( 'Turnstile site key: paste the site key exactly as Cloudflare shows it (it starts with a digit and x, e.g. 0x4AAAA…).', 'aware-wave-oracle' );
			case 'cross_unsupported':
				return esc_html__( 'Embedding from another domain is not supported yet; same domain was saved.', 'aware-wave-oracle' );
			case 'theme_map':
				/* translators: %s: the lines that were not saved */
				return sprintf( esc_html__( 'Theme colour map: these lines were not saved (use paletteN=palette slug, e.g. palette9=base): %s', 'aware-wave-oracle' ), esc_html( $detail ) );
			case 'maps':
				/* translators: %s: the lines that were not saved */
				return sprintf( esc_html__( 'These lines were not saved (wrong format, or a language the engine does not have — zh-TW, en): %s', 'aware-wave-oracle' ), esc_html( $detail ) );
		}
		return esc_html( $code );
	}

	/**
	 * Same-origin installs hand ENGINE_PREFIXES to the engine at the reverse proxy: a page (or a translation
	 * plugin's language slug) there can never be reached. Warn and list them; saving still goes through.
	 */
	private function warnEnginePrefixes(): void {
		$hits = array();
		foreach ( $this->postsAtEnginePrefixes() as $path => $post ) {
			$hits[] = sprintf( '%s (%s)', wp_strip_all_tags( $post->post_title ), $path );
		}
		foreach ( $this->translationSlugsAtEnginePrefixes() as $slug ) {
			/* translators: %s: a language slug in TranslatePress settings, e.g. en */
			$hits[] = sprintf( __( 'TranslatePress language slug /%s/', 'aware-wave-oracle' ), $slug );
		}
		if ( ! $hits ) {
			return;
		}
		$message = sprintf(
			/* translators: 1: list of reserved path prefixes, 2: list of pages */
			esc_html__( 'These addresses start with a path the engine uses (%1$s) and will not reach WordPress: %2$s', 'aware-wave-oracle' ),
			esc_html( '/' . implode( '/, /', Normalize::ENGINE_PREFIXES ) . '/' ),
			esc_html( implode( ' | ', $hits ) )
		);
		$this->report( 'engine_prefix', $message, 'warning' );
	}

	/** @return array<string,\WP_Post> path => post */
	private function postsAtEnginePrefixes(): array {
		$names = array_map( 'strtolower', Normalize::ENGINE_PREFIXES );
		$found = get_posts(
			array(
				'post_type'        => get_post_types( array( 'public' => true ) ),
				'post_status'      => array( 'publish', 'future', 'draft', 'pending', 'private' ),
				'post_name__in'    => $names,
				'posts_per_page'   => 50,
				'no_found_rows'    => true,
				'suppress_filters' => true,
			)
		);
		$out = array();
		foreach ( $found as $post ) {
			// Drafts, pending and scheduled posts have a ?p= permalink; the sample permalink is where they will live.
			$path = in_array( $post->post_status, array( 'publish', 'private' ), true )
				? wp_parse_url( (string) get_permalink( $post ), PHP_URL_PATH )
				: self::samplePath( $post );
			if ( is_string( $path ) && Normalize::pathHitsEnginePrefix( $path ) ) {
				$out[ $path ] = $post;
			}
		}
		return $out;
	}

	/** Where an unpublished post will live once published (get_sample_permalink is admin-only; this runs in wp-admin). */
	private static function samplePath( \WP_Post $post ) {
		$sample = get_sample_permalink( $post );
		return wp_parse_url( str_replace( array( '%pagename%', '%postname%' ), (string) $sample[1], (string) $sample[0] ), PHP_URL_PATH );
	}

	/** @return array<int,string> */
	private function translationSlugsAtEnginePrefixes(): array {
		$trp = get_option( 'trp_settings' );
		if ( ! is_array( $trp ) || ! isset( $trp['url-slugs'] ) || ! is_array( $trp['url-slugs'] ) ) {
			return array();
		}
		$out = array();
		foreach ( $trp['url-slugs'] as $slug ) {
			if ( is_string( $slug ) && Normalize::pathHitsEnginePrefix( '/' . $slug . '/' ) ) {
				$out[] = $slug;
			}
		}
		return $out;
	}

	public function render(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'aware-wave-oracle' ) );
		}
		$s      = Options::get();
		$notice = $this->notice();

		echo '<div class="wrap"><h1>' . esc_html__( 'AwareWave Oracle', 'aware-wave-oracle' ) . '</h1>';
		if ( $notice ) {
			echo '<div class="notice notice-' . esc_attr( $notice[0] ) . ' is-dismissible"><p>' . esc_html( $notice[1] ) . '</p></div>';
		}
		// options-general.php prints settings errors for the Settings API save itself; this page lives there too.

		// --- Main settings (Settings API; sanitize() validates) ---
		echo '<form method="post" action="options.php">';
		settings_fields( self::GROUP );
		$name = Options::OPTION;
		echo '<table class="form-table" role="presentation">';
		$this->embedRow( $name . '[embed]', $s['embed'] );
		$this->textRow( $name . '[browser_engine_url]', $s['browser_engine_url'], __( 'Engine URL (browser)', 'aware-wave-oracle' ), __( 'Cross-origin only: the address visitors’ browsers load the embedded tools from, e.g. https://engine.example.com', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[server_engine_url]', $s['server_engine_url'], __( 'Engine URL (server)', 'aware-wave-oracle' ), __( 'Address this WordPress server calls the engine at; may be an internal http:// address. Empty: this site’s own address (same-origin) or the browser URL (cross-origin).', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[key_id]', $s['key_id'], __( 'Key ID', 'aware-wave-oracle' ), __( 'The name this site is registered under at the engine.', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[default_locale]', $s['default_locale'], __( 'Default engine language', 'aware-wave-oracle' ), __( 'zh-TW or en. Used when the page language is neither and has no entry below.', 'aware-wave-oracle' ) );
		$this->areaRow( $name . '[locale_map]', Normalize::pairsToText( $s['locale_map'] ), __( 'Language map', 'aware-wave-oracle' ), __( 'Optional, one per line: WordPress locale=engine language, e.g. zh_HK=zh-TW. zh_TW and en_* need no entry.', 'aware-wave-oracle' ) );
		$this->areaRow( $name . '[page_map]', Normalize::pairsToText( $s['page_map'] ), __( 'Tool pages', 'aware-wave-oracle' ), __( 'One per line: tool=page ID. When the embedded tool links to another tool, the visitor goes to that page.', 'aware-wave-oracle' ) );
		$this->areaRow( $name . '[theme_map]', Normalize::pairsToText( $s['theme_map'] ), __( 'Theme colour map', 'aware-wave-oracle' ), __( 'Optional, one per line: tool palette slot=this site\'s palette slug, e.g. palette9=base. The tools use Kadence\'s nine global palette slots (1–2 accents, 3–6 text dark to light, 7–9 backgrounds). Kadence needs no entry; other themes map from theme.json automatically, list a slot here to set or replace it.', 'aware-wave-oracle' ) );
		$this->mailerRow( $name . '[mailer]', $s['mailer'] );
		$this->textRow( $name . '[fluentform_id]', $s['fluentform_id'] ? (string) $s['fluentform_id'] : '', __( 'Signup form (Fluent Forms ID)', 'aware-wave-oracle' ), __( 'Optional: set by “wp aworacle daily-form”. Put that form’s shortcode on the signup page. Empty: the built-in form [aw_oracle_daily].', 'aware-wave-oracle' ) );
		$this->textRow( $name . '[turnstile_site_key]', $s['turnstile_site_key'], __( 'Turnstile site key', 'aware-wave-oracle' ), __( 'Optional: Cloudflare Turnstile human check on the daily-letter signup form. Site key here, secret key in the Human check section below.', 'aware-wave-oracle' ) );
		echo '</table>';
		submit_button();
		echo '</form>';

		// --- Site key ---
		$keypair  = Options::keypair();
		$has      = SiteKey::usable( $keypair );
		$constant = Options::keypairFromConstant();
		echo '<h2>' . esc_html__( 'Site key', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . esc_html__( 'This site signs its requests to the engine with an Ed25519 key. The private half never leaves this site; register the public key below with the engine under the key ID above.', 'aware-wave-oracle' ) . '</p>';
		if ( $has ) {
			echo '<textarea readonly rows="4" class="large-text code" onclick="this.select()">' . esc_textarea( SiteKey::publicKeyPem( $keypair ) ) . '</textarea>';
		} elseif ( $constant ) {
			echo '<p><strong>' . esc_html__( 'AWORACLE_SITE_KEYPAIR in wp-config.php is not a valid key.', 'aware-wave-oracle' ) . '</strong></p>';
		} else {
			echo '<p><em>' . esc_html__( 'No key yet.', 'aware-wave-oracle' ) . '</em></p>';
		}
		if ( $constant ) {
			echo '<p>' . esc_html__( 'The key comes from the AWORACLE_SITE_KEYPAIR constant in wp-config.php; change it there.', 'aware-wave-oracle' ) . '</p>';
		} else {
			$this->actionFormStart( 'key' );
			if ( $has ) {
				echo '<p><label><input type="checkbox" name="aworacle_confirm" value="1"> ' . esc_html__( 'I understand the old key stops working until the new public key is registered at the engine.', 'aware-wave-oracle' ) . '</label></p>';
			}
			submit_button( $has ? __( 'Rotate key', 'aware-wave-oracle' ) : __( 'Generate key', 'aware-wave-oracle' ), $has ? 'secondary' : 'primary', 'submit', false );
			echo '</form>';
		}

		// --- Turnstile secret (own form: a secret never goes through the autoloaded settings option) ---
		$this->turnstileSection();

		// --- Member data key (saved charts and persons) ---
		$this->storageSection();

		// --- Member pseudonym salt ---
		echo '<h2>' . esc_html__( 'Member pseudonyms', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . esc_html__( 'The engine never sees member IDs or e-mails, only HMAC(salt, user ID). Rotating the salt makes every member look new to the engine (usage limits restart).', 'aware-wave-oracle' ) . '</p>';
		$this->actionFormStart( 'salt' );
		echo '<p><label><input type="checkbox" name="aworacle_confirm" value="1"> ' . esc_html__( 'Yes, rotate the salt.', 'aware-wave-oracle' ) . '</label></p>';
		submit_button( __( 'Rotate salt', 'aware-wave-oracle' ), 'secondary', 'submit', false );
		echo '</form>';

		// --- Tool list ---
		$tools = EngineClient::tools();
		echo '<h2>' . esc_html__( 'Tools available from the engine', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . ( $tools ? '<code>' . implode( '</code> <code>', array_map( 'esc_html', $tools ) ) . '</code>' : '<em>' . esc_html__( 'None — check the engine URL.', 'aware-wave-oracle' ) . '</em>' ) . '</p>';
		echo '<p>' . esc_html__( 'Shortcode:', 'aware-wave-oracle' ) . ' <code>[aw_oracle tool="ziwei"]</code></p>';
		$this->actionFormStart( 'tools' );
		submit_button( __( 'Refresh tool list', 'aware-wave-oracle' ), 'secondary', 'submit', false );
		echo '</form></div>';
	}

	/** The daily letter is on without a working human check: say so on the dashboard and plugins screens. */
	public function turnstileNotice(): void {
		if ( ! current_user_can( self::CAP ) || Options::get()['mailer'] !== Normalize::MAILER_FLUENTCRM || Turnstile::status() === 'on' ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || ! in_array( $screen->id, array( 'dashboard', 'plugins' ), true ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p>' . esc_html( self::turnstileOffText() ) . ' <a href="' . esc_url( admin_url( 'options-general.php?page=' . self::SLUG ) ) . '">' . esc_html__( 'Settings → AwareWave Oracle', 'aware-wave-oracle' ) . '</a></p></div>';
	}

	private static function turnstileOffText(): string {
		return Turnstile::status() === 'partial'
			? __( 'AwareWave Oracle: the human check is not set up yet — Cloudflare Turnstile needs both the site key and the secret key. Until then the signup form relies on its rate limits, the hidden trap field and the daily cap on confirmation mails.', 'aware-wave-oracle' )
			: __( 'AwareWave Oracle: the human check is not set up yet (Cloudflare Turnstile). Until then the signup form relies on its rate limits, the hidden trap field and the daily cap on confirmation mails.', 'aware-wave-oracle' );
	}

	/** Turnstile status and the secret key form (write-only: the stored secret is never shown). */
	private function turnstileSection(): void {
		echo '<h2>' . esc_html__( 'Human check', 'aware-wave-oracle' ) . '</h2>';
		if ( Turnstile::status() === 'on' ) {
			echo '<p><strong>' . esc_html__( 'Cloudflare Turnstile is on: a signup that Cloudflare does not confirm is refused before anything is stored or mailed.', 'aware-wave-oracle' ) . '</strong></p>';
		} else {
			echo '<p><strong>' . esc_html( self::turnstileOffText() ) . '</strong></p>';
		}
		if ( Options::turnstileSecretFromConstant() ) {
			echo '<p>' . esc_html__( 'The secret key comes from the AWORACLE_TURNSTILE_SECRET constant in wp-config.php; change it there.', 'aware-wave-oracle' ) . '</p>';
			return;
		}
		$has = Options::turnstileSecret() !== '';
		echo '<p>' . ( $has ? esc_html__( 'A secret key is saved (not shown). Enter a new one to replace it.', 'aware-wave-oracle' ) : esc_html__( 'No secret key yet.', 'aware-wave-oracle' ) ) . ' '
			. esc_html__( 'It can also be set in wp-config.php instead: define( \'AWORACLE_TURNSTILE_SECRET\', \'…\' );', 'aware-wave-oracle' ) . '</p>';
		$this->actionFormStart( 'turnstile' );
		echo '<p><label for="aworacle-turnstile-secret">' . esc_html__( 'Turnstile secret key', 'aware-wave-oracle' ) . '</label> ';
		echo '<input type="password" class="regular-text" id="aworacle-turnstile-secret" name="aworacle_turnstile_secret" value="" autocomplete="off"></p>';
		if ( $has ) {
			echo '<p><label><input type="checkbox" name="aworacle_turnstile_clear" value="1"> ' . esc_html__( 'Remove the saved secret key (turns the human check off).', 'aware-wave-oracle' ) . '</label></p>';
		}
		submit_button( __( 'Save secret key', 'aware-wave-oracle' ), 'secondary', 'submit', false );
		echo '</form>';
	}

	/** Saving is off until AWORACLE_DATA_KEY is set: say why on the dashboard and plugins screens. */
	public function storageNotice(): void {
		if ( ! current_user_can( self::CAP ) || Options::dataKeyStatus() === 'ok' ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || ! in_array( $screen->id, array( 'dashboard', 'plugins' ), true ) ) {
			return;
		}
		echo '<div class="notice notice-warning"><p>' . esc_html( $this->storageReason() ) . ' <a href="' . esc_url( admin_url( 'options-general.php?page=' . self::SLUG ) ) . '">' . esc_html__( 'Settings → AwareWave Oracle', 'aware-wave-oracle' ) . '</a></p></div>';
	}

	private function storageReason(): string {
		return Options::dataKeyStatus() === 'invalid'
			? __( 'AwareWave Oracle: members cannot save charts — AWORACLE_DATA_KEY in wp-config.php is not a valid key (base64 of 32 bytes).', 'aware-wave-oracle' )
			: __( 'AwareWave Oracle: members cannot save charts — AWORACLE_DATA_KEY is not set in wp-config.php.', 'aware-wave-oracle' );
	}

	/**
	 * Status of the member-data key. When it is missing, a freshly generated key is offered to paste into
	 * wp-config.php; it is never stored by the plugin.
	 */
	private function storageSection(): void {
		echo '<h2>' . esc_html__( 'Member data', 'aware-wave-oracle' ) . '</h2>';
		echo '<p>' . esc_html__( 'Members can save their own charts and the people they read for ([aw_oracle_my_charts], [aw_oracle_persons]). Names and birth data are encrypted with a key kept in wp-config.php, never in the database, so database backups hold only ciphertext.', 'aware-wave-oracle' ) . '</p>';
		if ( Options::dataKeyStatus() === 'ok' ) {
			echo '<p><strong>' . esc_html__( 'Saving is on.', 'aware-wave-oracle' ) . '</strong> ' . esc_html__( 'Keep a copy of AWORACLE_DATA_KEY outside this server: without it the saved entries cannot be read.', 'aware-wave-oracle' ) . '</p>';
			return;
		}
		echo '<p><strong>' . esc_html( $this->storageReason() ) . '</strong></p>';
		echo '<p>' . esc_html__( 'Add this line to wp-config.php above “That’s all, stop editing!”, and keep a copy outside this server:', 'aware-wave-oracle' ) . '</p>';
		echo '<textarea readonly rows="2" class="large-text code" onclick="this.select()">' . esc_textarea( "define( '" . Options::DATA_KEY_CONSTANT . "', '" . Vault::newKeyBase64() . "' );" ) . '</textarea>';
	}

	/** admin-post.php handler: do the action, then redirect back with a notice code (Post/Redirect/Get). */
	public function handleAction(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( esc_html__( 'Insufficient permissions.', 'aware-wave-oracle' ), '', array( 'response' => 403 ) );
		}
		$op      = isset( $_POST['op'] ) ? sanitize_key( wp_unslash( $_POST['op'] ) ) : '';
		$confirm = isset( $_POST['aworacle_confirm'] ) && $_POST['aworacle_confirm'] === '1';
		$code    = '';
		if ( $op === 'key' ) {
			check_admin_referer( 'aworacle_key' );
			if ( Options::keypairFromConstant() ) {
				$code = 'key_constant';
			} elseif ( SiteKey::usable( Options::keypair() ) && ! $confirm ) {
				$code = 'key_confirm';
			} else {
				update_option( Options::KEY_OPTION, SiteKey::newKeypair(), false );
				$code = 'key_done';
			}
		} elseif ( $op === 'salt' ) {
			check_admin_referer( 'aworacle_salt' );
			if ( ! $confirm ) {
				$code = 'salt_confirm';
			} else {
				update_option( Options::SALT_OPTION, Options::newSalt(), false );
				$code = 'salt_done';
			}
		} elseif ( $op === 'turnstile' ) {
			check_admin_referer( 'aworacle_turnstile' );
			$raw = isset( $_POST['aworacle_turnstile_secret'] ) ? trim( (string) wp_unslash( $_POST['aworacle_turnstile_secret'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- checked against the key pattern
			if ( Options::turnstileSecretFromConstant() ) {
				$code = 'turnstile_constant';
			} elseif ( isset( $_POST['aworacle_turnstile_clear'] ) && $_POST['aworacle_turnstile_clear'] === '1' ) {
				delete_option( Options::TURNSTILE_SECRET_OPTION );
				$code = 'turnstile_cleared';
			} elseif ( Normalize::turnstileKey( $raw ) === '' ) {
				$code = 'turnstile_bad';
			} else {
				// Not autoloaded: the secret is read only when a signup is checked.
				update_option( Options::TURNSTILE_SECRET_OPTION, Normalize::turnstileKey( $raw ), false );
				$code = 'turnstile_done';
			}
		} elseif ( $op === 'tools' ) {
			check_admin_referer( 'aworacle_tools' );
			EngineClient::forgetTools();
			$code = 'tools_done';
		}
		wp_safe_redirect( add_query_arg( array( 'page' => self::SLUG, self::NOTICE => $code ), admin_url( 'options-general.php' ) ) );
		exit;
	}

	/** @return array{0:string,1:string}|null [notice type, message] from the redirect's notice code */
	private function notice(): ?array {
		$code     = isset( $_GET[ self::NOTICE ] ) ? sanitize_key( wp_unslash( $_GET[ self::NOTICE ] ) ) : '';
		$messages = array(
			'key_done'     => array( 'success', __( 'New key created. Register the public key below at the engine.', 'aware-wave-oracle' ) ),
			'key_confirm'  => array( 'warning', __( 'Tick the confirmation box to rotate the key.', 'aware-wave-oracle' ) ),
			'key_constant' => array( 'warning', __( 'The key comes from the AWORACLE_SITE_KEYPAIR constant in wp-config.php; change it there.', 'aware-wave-oracle' ) ),
			'salt_done'    => array( 'success', __( 'Salt rotated.', 'aware-wave-oracle' ) ),
			'salt_confirm' => array( 'warning', __( 'Tick the confirmation box to rotate the salt.', 'aware-wave-oracle' ) ),
			'tools_done'   => array( 'success', __( 'Tool list refreshed.', 'aware-wave-oracle' ) ),
			'turnstile_done'     => array( 'success', __( 'Turnstile secret key saved.', 'aware-wave-oracle' ) ),
			'turnstile_cleared'  => array( 'success', __( 'Turnstile secret key removed.', 'aware-wave-oracle' ) ),
			'turnstile_bad'      => array( 'error', __( 'That is not a Turnstile secret key (it starts with a digit and x, e.g. 0x4AAAA…); nothing was changed.', 'aware-wave-oracle' ) ),
			'turnstile_constant' => array( 'warning', __( 'The secret key comes from the AWORACLE_TURNSTILE_SECRET constant in wp-config.php; change it there.', 'aware-wave-oracle' ) ),
		);
		return $messages[ $code ] ?? null;
	}

	private function actionFormStart( string $op ): void {
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'aworacle_' . $op );
		echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '">';
		echo '<input type="hidden" name="op" value="' . esc_attr( $op ) . '">';
	}

	/**
	 * Two visible choices (no dropdown). Cross-origin is shown but disabled: the engine only allows
	 * same-origin frames and has no message protocol yet (Normalize::settings() refuses it as well).
	 */
	private function embedRow( string $name, string $value ): void {
		echo '<tr><th scope="row">' . esc_html__( 'Embedding', 'aware-wave-oracle' ) . '</th><td><fieldset>';
		echo '<p><label><input type="radio" name="' . esc_attr( $name ) . '" value="' . esc_attr( Normalize::EMBED_SAME_ORIGIN ) . '"' . checked( $value !== Normalize::EMBED_CROSS_ORIGIN, true, false ) . '> '
			. esc_html__( 'Same domain (recommended): the engine answers under this site’s address at /embed/, /api/, /_next/, /tarot/.', 'aware-wave-oracle' ) . '</label></p>';
		echo '<p><label><input type="radio" disabled value="' . esc_attr( Normalize::EMBED_CROSS_ORIGIN ) . '"' . checked( $value, Normalize::EMBED_CROSS_ORIGIN, false ) . '> '
			. esc_html__( 'Another domain (not supported yet): the engine has its own address; the page and the tool would talk by messages.', 'aware-wave-oracle' ) . '</label></p>';
		echo '</fieldset></td></tr>';
	}

	/** Daily letter: two visible choices, then what is missing (FluentCRM, data key, webhook secret) and the webhook URL. */
	private function mailerRow( string $name, string $value ): void {
		echo '<tr><th scope="row">' . esc_html__( 'Daily fortune letter', 'aware-wave-oracle' ) . '</th><td><fieldset>';
		$choices = array(
			Normalize::MAILER_NONE      => __( 'Off: no signup form, nothing is sent.', 'aware-wave-oracle' ),
			Normalize::MAILER_FLUENTCRM => __( 'On, sent through FluentCRM (signup form [aw_oracle_daily], double opt-in, one letter a day at 07:00 in each subscriber’s time zone).', 'aware-wave-oracle' ),
		);
		foreach ( $choices as $v => $label ) {
			echo '<p><label><input type="radio" name="' . esc_attr( $name ) . '" value="' . esc_attr( $v ) . '"' . checked( $value, $v, false ) . '> ' . esc_html( $label ) . '</label></p>';
		}
		if ( $value === Normalize::MAILER_FLUENTCRM ) {
			$reason = \AwareWave\Oracle\Daily\Runner::offReason();
			if ( $reason === 'fluentcrm' ) {
				echo '<p><strong>' . esc_html__( 'FluentCRM is not active: the signup form is hidden and nothing is sent.', 'aware-wave-oracle' ) . '</strong></p>';
			} elseif ( $reason === 'data_key' ) {
				echo '<p><strong>' . esc_html__( 'AWORACLE_DATA_KEY is missing (see Member data below): the signup form shows that subscribing is not available.', 'aware-wave-oracle' ) . '</strong></p>';
			}
			$last = get_option( \AwareWave\Oracle\Daily\Runner::LAST_RUN_OPTION );
			if ( is_array( $last ) && isset( $last['at'], $last['stats'] ) ) {
				$st = (array) $last['stats'];
				echo '<p class="description">' . esc_html(
					sprintf(
						/* translators: 1: date and time (UTC), 2: letters handed to FluentCRM, 3: put back for a later hour, 4: failed */
						__( 'Last hourly run %1$s UTC: %2$d handed to FluentCRM, %3$d put back for a later hour (engine or data problem), %4$d failed.', 'aware-wave-oracle' ),
						gmdate( 'Y-m-d H:i', (int) $last['at'] ),
						(int) ( $st['sent'] ?? 0 ),
						(int) ( $st['released'] ?? 0 ),
						(int) ( $st['failed'] ?? 0 )
					)
				) . '</p>';
			}
			echo '<p class="description">' . esc_html__( 'Resend webhook URL (events email.bounced, email.complained):', 'aware-wave-oracle' ) . ' <code>' . esc_html( rest_url( 'aworacle/v1/daily/resend-webhook' ) ) . '</code> — '
				. ( Options::webhookSecret() !== ''
					? esc_html__( 'signing secret set.', 'aware-wave-oracle' )
					: esc_html__( 'set its signing secret in wp-config.php: define( \'AWORACLE_RESEND_WEBHOOK_SECRET\', \'whsec_…\' );', 'aware-wave-oracle' ) )
				. '</p>';
		}
		echo '</fieldset></td></tr>';
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
