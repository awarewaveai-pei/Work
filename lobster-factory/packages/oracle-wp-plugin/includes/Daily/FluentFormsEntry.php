<?php
/**
 * Fluent Forms as the front of the daily-letter signup (checked against fluentform 6.2.17). The form is only a
 * face: a submission goes to Rest::accept, the same path as the built-in form, and Fluent Forms never stores it.
 *
 * Nothing stored — two independent guards, only for the signup form (the configured id, or any copy that has
 * our birthplace field):
 *  1. fluentform/insert_response_data → nothing: whatever Fluent Forms would write holds no answer.
 *  2. fluentform/before_insert_submission: handle it, answer the browser, exit — the same way Fluent Forms'
 *     own honeypot ends a request — so Submission::insertGetId, entry details, logs, notifications and
 *     integrations never run. It never returns, whatever happens inside.
 * Akismet and CleanTalk are off for this form: their "spam" path inserts before that action, and they would
 * send the birth data to a third party.
 *
 * Human check: the plugin's own Turnstile (verified inside Rest::accept), so there is one set of keys and the
 * check cannot be lost by editing the form; Fluent Forms' captchas are then off for this form.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Embed\EmbedUrl;
use AwareWave\Oracle\Settings\Options;

final class FluentFormsEntry {

	/** The field that marks a form as the signup form even when it is a copy with another id. */
	const MARKER = 'aw_place_lat';

	public function register(): void {
		add_filter( 'fluentform/insert_response_data', array( self::class, 'blank' ), PHP_INT_MAX, 2 );
		add_action( 'fluentform/before_insert_submission', array( self::class, 'take' ), PHP_INT_MAX, 3 );
		add_filter( 'fluentform/akismet_check_spam', array( self::class, 'noSpamService' ), PHP_INT_MAX, 2 );
		add_filter( 'fluentform/cleantalk_check_spam', array( self::class, 'noSpamService' ), PHP_INT_MAX, 2 );
		add_filter( 'fluentform/disable_captcha', array( self::class, 'noSecondCaptcha' ), PHP_INT_MAX, 2 );
	}

	/** @param mixed $form a Fluent Forms form object (id, form_fields), or just its id */
	public static function isSignupForm( $form ): bool {
		$configured = (int) ( Options::get()['fluentform_id'] ?? 0 );
		$id         = (int) ( is_object( $form ) ? ( $form->id ?? 0 ) : $form );
		if ( $configured > 0 && $id === $configured ) {
			return true;
		}
		return is_object( $form ) && strpos( (string) ( $form->form_fields ?? '' ), '"' . self::MARKER . '"' ) !== false;
	}

	/**
	 * @param mixed $data
	 * @param mixed $formId
	 * @return mixed
	 */
	public static function blank( $data, $formId ) {
		return self::isSignupForm( self::formById( $formId ) ) ? array() : $data;
	}

	/**
	 * @param mixed $check
	 * @param mixed $formId
	 */
	public static function noSpamService( $check, $formId ): bool {
		return self::isSignupForm( self::formById( $formId ) ) ? false : (bool) $check;
	}

	/**
	 * @param mixed $disabled
	 * @param mixed $form
	 */
	public static function noSecondCaptcha( $disabled, $form ): bool {
		return ( self::isSignupForm( $form ) && Turnstile::status() === 'on' ) ? true : (bool) $disabled;
	}

	/**
	 * fluentform/before_insert_submission. For the signup form this ends the request.
	 *
	 * @param mixed $insertData
	 * @param mixed $submitted the posted fields as Fluent Forms parsed them
	 * @param mixed $form
	 */
	public static function take( $insertData, $submitted, $form ): void {
		if ( ! self::isSignupForm( $form ) ) {
			return;
		}
		try {
			list( $status, $payload ) = self::handle( is_array( $submitted ) ? $submitted : array() );
		} catch ( \Throwable $e ) {
			// Where, not what: the message could quote what the visitor typed.
			error_log( 'aware-wave-oracle: Fluent Forms signup failed: ' . get_class( $e ) . ' at ' . basename( $e->getFile() ) . ':' . $e->getLine() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
			list( $status, $payload ) = array( 500, array( 'errors' => array( 'aworacle' => array( __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' ) ) ) ) );
		}
		wp_send_json( $payload, $status ); // exits
		exit; // never fall through to the insert, even if something replaced the die handler
	}

	/**
	 * The submission through the shared signup path, as the answer Fluent Forms' script expects.
	 *
	 * @param array<string,mixed> $in
	 * @return array{0:int,1:array<string,mixed>} HTTP status, JSON body
	 */
	public static function handle( array $in ): array {
		$locale = in_array( $in['aw_locale'] ?? '', EmbedUrl::ENGINE_LOCALES, true ) ? $in['aw_locale'] : EmbedUrl::FALLBACK_LOCALE;
		$result = Rest::accept( self::body( $in, $locale ) );

		return Lang::with(
			Runner::WP_LOCALES[ $locale ] ?? 'en_US',
			static function () use ( $result ): array {
				if ( $result === Rest::ACCEPTED ) {
					return array(
						200,
						array(
							'success' => true,
							'data'    => array(
								'insert_id' => 0,
								'result'    => array(
									'message' => esc_html__( 'One more step: check your inbox and confirm your e-mail address.', 'aware-wave-oracle' ),
									'action'  => 'hide_form',
								),
							),
						),
					);
				}
				return self::refusal( $result );
			}
		);
	}

	/**
	 * Form fields → the body Rest::accept takes (the built-in form's shape). Types are converted only when the
	 * text is clearly of that type; anything else stays refused by Members\Record.
	 *
	 * @param array<string,mixed> $in
	 * @return array<string,mixed>
	 */
	public static function body( array $in, string $locale ): array {
		$text  = static function ( string $key ) use ( $in ): string {
			return isset( $in[ $key ] ) && is_string( $in[ $key ] ) ? trim( $in[ $key ] ) : '';
		};
		$int   = static function ( string $key ) use ( $text ) {
			return preg_match( '/^\d{1,4}$/', $text( $key ) ) ? (int) $text( $key ) : null;
		};
		$float = static function ( string $key ) use ( $text ) {
			return is_numeric( $text( $key ) ) ? (float) $text( $key ) : null;
		};
		// The hook gets the raw post: an unticked checkbox arrives as [''], so only the option's own value counts.
		$ticked = static function ( string $key ) use ( $in ): bool {
			return in_array( 'yes', (array) ( $in[ $key ] ?? array() ), true );
		};
		return array(
			'email'     => $text( 'email' ),
			'tz'        => $text( 'aw_tz' ),
			'locale'    => $locale,
			'turnstile' => $text( 'aw_turnstile' ),
			'birth'     => array(
				'calendar'    => $text( 'calendar' ),
				'year'        => $int( 'birth_year' ),
				'month'       => $int( 'birth_month' ),
				'day'         => $int( 'birth_day' ),
				'hour'        => $int( 'birth_hour' ),
				'minute'      => $int( 'birth_minute' ),
				'isLeapMonth' => $ticked( 'leap_month' ),
				'gender'      => $text( 'gender' ),
				'place'       => array(
					'label' => $text( 'aw_place_label' ),
					'lat'   => $float( 'aw_place_lat' ),
					'lon'   => $float( 'aw_place_lon' ),
					'zone'  => $text( 'aw_place_zone' ),
				),
				'trueSolar'   => $ticked( 'true_solar' ),
				'dayDivide'   => 'current',
			),
		);
	}

	/**
	 * Fluent Forms shows no success and these messages: next to the fields it knows, and one line that says
	 * the visitor is not subscribed.
	 *
	 * @param string|\WP_Error $result
	 * @return array{0:int,1:array<string,mixed>}
	 */
	private static function refusal( $result ): array {
		$status = 422;
		$names  = array();
		$why    = __( 'Something went wrong. Reload the page and try again.', 'aware-wave-oracle' );
		if ( $result === Rest::MAIL_FAILED ) {
			$why = __( 'The confirmation mail could not be sent. Try again later.', 'aware-wave-oracle' );
		} elseif ( $result === Rest::MAIL_CAP ) {
			$why = __( 'Today’s confirmation mails are used up. Try again tomorrow.', 'aware-wave-oracle' );
		} else {
			$data   = (array) $result->get_error_data();
			$status = (int) ( $data['status'] ?? 500 );
			$code   = $result->get_error_code();
			if ( $code === 'aworacle_invalid' ) {
				$labels = FluentFormsDefinition::labels();
				foreach ( (array) ( $data['fields'] ?? array() ) as $path ) {
					$field = self::fieldFor( (string) $path );
					if ( isset( $labels[ $field ] ) ) {
						$names[ $field ] = $labels[ $field ];
					}
				}
				if ( $names ) {
					/* translators: %s: names of the fields to correct */
					$why = sprintf( __( 'Please correct: %s', 'aware-wave-oracle' ), implode( __( ', ', 'aware-wave-oracle' ), $names ) );
				}
			} elseif ( $code === 'aworacle_daily_rate' ) {
				$why = __( 'Too many requests. Try again in an hour.', 'aware-wave-oracle' );
			} elseif ( $code === 'aworacle_daily_captcha' ) {
				$why = __( 'The human check did not pass. Try it again.', 'aware-wave-oracle' );
			} elseif ( $code === 'aworacle_daily_off' ) {
				$why = __( 'Subscribing is not available on this site yet.', 'aware-wave-oracle' );
			}
		}
		$errors = array( 'aworacle' => array( esc_html( __( 'You are not subscribed yet.', 'aware-wave-oracle' ) . ' ' . $why ) ) );
		foreach ( $names as $field => $label ) {
			/* translators: %s: names of the fields to correct */
			$errors[ $field ] = array( esc_html( sprintf( __( 'Please correct: %s', 'aware-wave-oracle' ), $label ) ) );
		}
		return array( $status, array( 'errors' => $errors ) );
	}

	/** Record error path (birth.month, birth.place.lat, tz …) → form field name. */
	private static function fieldFor( string $path ): string {
		if ( strpos( $path, 'birth.place' ) === 0 || $path === 'tz' ) {
			return 'aw_place';
		}
		$map = array(
			'email'             => 'email',
			'birth.calendar'    => 'calendar',
			'birth.year'        => 'birth_year',
			'birth.month'       => 'birth_month',
			'birth.day'         => 'birth_day',
			'birth.hour'        => 'birth_hour',
			'birth.minute'      => 'birth_minute',
			'birth.gender'      => 'gender',
			'birth.isLeapMonth' => 'leap_month',
			'birth.trueSolar'   => 'true_solar',
		);
		return $map[ $path ] ?? '';
	}

	/** @param mixed $formId */
	private static function formById( $formId ) {
		$id = (int) $formId;
		if ( class_exists( '\FluentForm\App\Models\Form' ) ) {
			$form = \FluentForm\App\Models\Form::find( $id );
			if ( $form ) {
				return $form;
			}
		}
		return $id;
	}
}
