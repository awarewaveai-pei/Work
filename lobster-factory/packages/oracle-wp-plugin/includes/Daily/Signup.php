<?php
/**
 * Signup form: shortcode [aw_oracle_daily] and block "aware-wave/oracle-daily" (same output).
 * Nothing at all when the letter is off (setting mailer = none) or FluentCRM is not active (§2-9);
 * a plain notice when the member-data key is missing (birth data is never stored in the clear).
 * The page holds an empty container; assets/daily.js builds the form and posts to REST daily/subscribe.
 * With Turnstile set up, Cloudflare's widget sits above the button and its token goes with the post.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Embed\Renderer;
use AwareWave\Oracle\Members\Rest as MembersRest;
use AwareWave\Oracle\Places\Birthplace;

final class Signup {

	const TAG    = 'aw_oracle_daily';
	const BLOCK  = 'aware-wave/oracle-daily';
	const SCRIPT = 'aworacle-daily';
	const TURNSTILE_SCRIPT = 'aworacle-turnstile';

	/** @var bool */
	private static $configured = false;

	public function register(): void {
		add_shortcode( self::TAG, array( self::class, 'render' ) );
		add_action(
			'init',
			function () {
				register_block_type(
					self::BLOCK,
					array(
						'api_version'     => 3,
						'title'           => __( 'AwareWave daily fortune signup', 'aware-wave-oracle' ),
						'category'        => 'widgets',
						'icon'            => 'email',
						'editor_script'   => 'aworacle-block-editor',
						'render_callback' => array( self::class, 'render' ),
					)
				);
			}
		);
	}

	public static function render(): string {
		$off = Runner::offReason();
		if ( $off === 'mailer' || $off === 'fluentcrm' ) {
			return '';
		}
		if ( $off === 'data_key' ) {
			return '<p class="aworacle-daily-off">' . esc_html__( 'Subscribing is not available on this site yet.', 'aware-wave-oracle' ) . '</p>';
		}
		self::enqueue();
		return '<div class="aworacle-daily"></div>';
	}

	private static function enqueue(): void {
		// Turnstile set up: Cloudflare's script loads first (no version query: it must not be cached or altered).
		$turnstile = Turnstile::siteKey();
		$deps      = array( Birthplace::enqueue() );
		if ( $turnstile !== '' ) {
			wp_enqueue_script( self::TURNSTILE_SCRIPT, Turnstile::SCRIPT_URL, array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			$deps[] = self::TURNSTILE_SCRIPT;
		}
		wp_enqueue_script( self::SCRIPT, AWORACLE_URL . 'assets/daily.js', $deps, AWORACLE_VERSION, true );
		Renderer::enqueueFormStyle();
		if ( self::$configured ) {
			return;
		}
		self::$configured = true;
		$config = array(
			'url'    => esc_url_raw( rest_url( MembersRest::NS . '/daily/subscribe' ) ),
			'nonce'  => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
			'locale' => Renderer::locale(),
			'turnstile' => $turnstile,
			'labels' => array(
				'title'     => __( 'Daily fortune by e-mail', 'aware-wave-oracle' ),
				'intro'     => __( 'One letter every morning after 07:00 in your time zone, calculated from your birth data. You can unsubscribe from any letter.', 'aware-wave-oracle' ),
				'email'     => __( 'E-mail', 'aware-wave-oracle' ),
				'tz'        => __( 'Your time zone (type to search)', 'aware-wave-oracle' ),
				'calendar'  => __( 'Calendar', 'aware-wave-oracle' ),
				'solar'     => __( 'Solar (Gregorian)', 'aware-wave-oracle' ),
				'lunar'     => __( 'Lunar', 'aware-wave-oracle' ),
				'leap'      => __( 'Leap month', 'aware-wave-oracle' ),
				'date'      => __( 'Birth date (year, month, day)', 'aware-wave-oracle' ),
				'time'      => __( 'Birth time, local clock (hour, minute)', 'aware-wave-oracle' ),
				'year'      => __( 'Year', 'aware-wave-oracle' ),
				'month'     => __( 'Month', 'aware-wave-oracle' ),
				'day'       => __( 'Day', 'aware-wave-oracle' ),
				'hour'      => __( 'Hour', 'aware-wave-oracle' ),
				'minute'    => __( 'Minute', 'aware-wave-oracle' ),
				'gender'    => __( 'Gender', 'aware-wave-oracle' ),
				'male'      => __( 'Male', 'aware-wave-oracle' ),
				'female'    => __( 'Female', 'aware-wave-oracle' ),
				'place'     => __( 'Birthplace', 'aware-wave-oracle' ),
				'trueSolar' => __( 'Use true solar time', 'aware-wave-oracle' ),
				'submit'    => __( 'Subscribe', 'aware-wave-oracle' ),
				'notSubscribed' => __( 'You are not subscribed yet.', 'aware-wave-oracle' ),
				'invalid'   => __( 'Please correct:', 'aware-wave-oracle' ),
				/* translators: separator between field names in a list */
				'listSeparator' => __( ', ', 'aware-wave-oracle' ),
				'captcha'   => __( 'Complete the human check above the button first.', 'aware-wave-oracle' ),
				'captchaBlocked' => __( 'The human check could not load. Allow challenges.cloudflare.com (an ad or script blocker may stop it) or try another browser.', 'aware-wave-oracle' ),
				'error'     => __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' ),
			),
		);
		wp_add_inline_script( self::SCRIPT, 'window.AWORACLE_DAILY=' . wp_json_encode( $config ) . ';', 'before' );
	}
}
