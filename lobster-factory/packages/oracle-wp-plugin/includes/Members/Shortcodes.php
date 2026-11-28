<?php
/**
 * [aw_oracle_my_charts] and [aw_oracle_persons]: the member's own list (view, add, edit, delete) on any
 * WordPress page. The page is rendered empty and assets/members.js fills it from REST aworacle/v1, so
 * birth data never sits in cached page HTML.
 *  - not logged in: "Log in to save" with a login link (the tools themselves stay open to everyone)
 *  - saving off (no AWORACLE_DATA_KEY): a plain notice; administrators also see where to fix it
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Admin\SettingsPage;
use AwareWave\Oracle\Daily\Runner;
use AwareWave\Oracle\Daily\Turnstile;
use AwareWave\Oracle\Embed\Renderer;
use AwareWave\Oracle\Places\Birthplace;
use AwareWave\Oracle\Settings\Options;

final class Shortcodes {

	const SCRIPT = 'aworacle-members';
	// "me" is the member's own birth data alone, to place anywhere (an account page); "charts" shows it on top.
	const TAGS   = array(
		'aw_oracle_me'        => 'me',
		'aw_oracle_my_charts' => 'charts',
		'aw_oracle_persons'   => 'persons',
	);

	/** @var bool */
	private static $configured = false;

	public function register(): void {
		foreach ( self::TAGS as $tag => $kind ) {
			add_shortcode(
				$tag,
				function () use ( $kind ) {
					return self::render( $kind );
				}
			);
		}
	}

	public static function render( string $kind ): string {
		if ( ! is_user_logged_in() ) {
			return '<p class="aworacle-members-login"><a href="' . esc_url( wp_login_url( (string) get_permalink() ) ) . '">' . esc_html__( 'Log in to save', 'aware-wave-oracle' ) . '</a></p>';
		}
		if ( Options::dataKey() === '' ) {
			$out = '<p class="aworacle-members-off">' . esc_html__( 'Saving is not available on this site yet.', 'aware-wave-oracle' ) . '</p>';
			if ( current_user_can( SettingsPage::CAP ) ) {
				$out .= '<p class="aworacle-members-off"><a href="' . esc_url( admin_url( 'options-general.php?page=' . SettingsPage::SLUG ) ) . '">' . esc_html__( 'Administrators: set the member-data key in Settings → AwareWave Oracle.', 'aware-wave-oracle' ) . '</a></p>';
			}
			return $out;
		}
		self::enqueue();
		return '<div class="aworacle-members" data-aworacle-kind="' . esc_attr( $kind ) . '"></div>';
	}

	private static function enqueue(): void {
		// The one-click subscription: only while the daily letter is on, with its human check when set up.
		$daily     = Runner::offReason() === '';
		$turnstile = $daily ? Turnstile::siteKey() : '';
		$deps      = array( Birthplace::enqueue() );
		if ( $turnstile !== '' ) {
			wp_enqueue_script( 'aworacle-turnstile', Turnstile::SCRIPT_URL, array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			$deps[] = 'aworacle-turnstile';
		}
		wp_enqueue_script( self::SCRIPT, AWORACLE_URL . 'assets/members.js', $deps, AWORACLE_VERSION, true );
		Renderer::enqueueFormStyle();
		if ( self::$configured ) {
			return;
		}
		self::$configured = true;
		$config = array(
			'root'   => esc_url_raw( rest_url( Rest::NS . '/' ) ),
			'nonce'  => wp_create_nonce( 'wp_rest' ),
			'daily'  => $daily,
			'locale' => Renderer::locale(),
			'turnstile' => $turnstile,
			'action' => Turnstile::ACTION,
			'labels' => array(
				'me'          => __( 'My birth data', 'aware-wave-oracle' ),
				'meNote'      => __( 'Fill it in once. The tools start with it, and you can subscribe to the daily letter with it.', 'aware-wave-oracle' ),
				'meNone'      => __( 'You have not filled it in yet.', 'aware-wave-oracle' ),
				'meNew'       => __( 'Fill in my birth data', 'aware-wave-oracle' ),
				'mePick'      => __( 'Or use a chart you already saved:', 'aware-wave-oracle' ),
				'meName'      => __( 'Me', 'aware-wave-oracle' ),
				'subscribe'   => __( 'Subscribe the daily letter with my birth data', 'aware-wave-oracle' ),
				/* translators: %s: the member's e-mail address */
				'subscribeTo' => __( 'The letter goes to %s. We send a confirmation mail first.', 'aware-wave-oracle' ),
				'captcha'     => __( 'Complete the human check above the button first.', 'aware-wave-oracle' ),
				'otherCharts' => __( 'My other charts', 'aware-wave-oracle' ),
				'charts'      => __( 'My charts', 'aware-wave-oracle' ),
				'persons'     => __( 'People I saved', 'aware-wave-oracle' ),
				'personsNote' => __( 'Only you can see these. Nobody is told that you saved them.', 'aware-wave-oracle' ),
				'empty'       => __( 'Nothing saved yet.', 'aware-wave-oracle' ),
				'add'         => __( 'Add', 'aware-wave-oracle' ),
				'edit'        => __( 'Edit', 'aware-wave-oracle' ),
				'delete'      => __( 'Delete', 'aware-wave-oracle' ),
				'confirm'     => __( 'Delete this entry?', 'aware-wave-oracle' ),
				'save'        => __( 'Save', 'aware-wave-oracle' ),
				'cancel'      => __( 'Cancel', 'aware-wave-oracle' ),
				'locked'      => __( 'This entry cannot be opened with the site’s current key. You can delete it.', 'aware-wave-oracle' ),
				'error'       => __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' ),
				'invalid'     => __( 'Check the highlighted fields.', 'aware-wave-oracle' ),
				'name'        => __( 'Name', 'aware-wave-oracle' ),
				'calendar'    => __( 'Calendar', 'aware-wave-oracle' ),
				'solar'       => __( 'Solar (Gregorian)', 'aware-wave-oracle' ),
				'lunar'       => __( 'Lunar', 'aware-wave-oracle' ),
				'leap'        => __( 'Leap month', 'aware-wave-oracle' ),
				'date'        => __( 'Birth date (year, month, day)', 'aware-wave-oracle' ),
				'time'        => __( 'Birth time, local clock (hour, minute)', 'aware-wave-oracle' ),
				'year'        => __( 'Year', 'aware-wave-oracle' ),
				'month'       => __( 'Month', 'aware-wave-oracle' ),
				'day'         => __( 'Day', 'aware-wave-oracle' ),
				'hour'        => __( 'Hour', 'aware-wave-oracle' ),
				'minute'      => __( 'Minute', 'aware-wave-oracle' ),
				'gender'      => __( 'Gender', 'aware-wave-oracle' ),
				'male'        => __( 'Male', 'aware-wave-oracle' ),
				'female'      => __( 'Female', 'aware-wave-oracle' ),
				'place'       => __( 'Birthplace', 'aware-wave-oracle' ),
				'trueSolar'   => __( 'Use true solar time', 'aware-wave-oracle' ),
				'dayDivide'   => __( 'Births 23:00–24:00 count as', 'aware-wave-oracle' ),
				'sameDay'     => __( 'the same day', 'aware-wave-oracle' ),
				'nextDay'     => __( 'the next day', 'aware-wave-oracle' ),
			),
		);
		wp_add_inline_script( self::SCRIPT, 'window.AWORACLE_MEMBERS=' . wp_json_encode( $config ) . ';', 'before' );
	}
}
