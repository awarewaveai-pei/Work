<?php
/**
 * The signup form as Fluent Forms stores it (element shapes from fluentform 6.2.17
 * app/Services/FormBuilder/DefaultElements.php), built from this code:
 *  - `wp aworacle daily-form` creates it, or updates the one it made before (never a second one), publishes it
 *    and records its id in the setting fluentform_id. Fields are rewritten from this code; styling is written
 *    only on creation (inherit the theme) and kept afterwards.
 *  - When it is shown, its words are replaced with the page's language (the stored ones are the site's).
 *  - Deactivating the plugin unpublishes it and every copy of it, so Fluent Forms never takes (and stores) a
 *    signup on its own.
 * No dropdowns: calendar and gender are visible radios; the birthplace is the shared city search, written
 * into hidden fields by assets/ff-daily.js.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Embed\Renderer;
use AwareWave\Oracle\Places\Birthplace;
use AwareWave\Oracle\Settings\Options;

final class FluentFormsDefinition {

	const SCRIPT = 'aworacle-ff-daily';
	/** Form meta on the form this plugin made. */
	const META = '_aworacle_daily_form';
	/** Fluent Forms' "Inherit Theme Style" (meta _ff_selected_style): none of its default colors or button styles. */
	const STYLE = 'ffs_inherit_theme';
	/** What the operator may restyle on a field; kept when the command rewrites the fields. */
	const LOOK_SETTINGS = array( 'container_class', 'label_placement', 'layout_class' );
	/** Ids that deactivation unpublished, to publish again on activation. */
	const UNPUBLISHED_OPTION = 'aworacle_ff_unpublished';

	public function register(): void {
		add_filter( 'fluentform/rendering_form', array( self::class, 'rendering' ) );
		add_filter( 'fluentform/form_class', array( self::class, 'formClass' ), 10, 2 );
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			\WP_CLI::add_command( 'aworacle daily-form', array( self::class, 'command' ) );
		}
	}

	/**
	 * @param mixed $classes
	 * @param mixed $form
	 */
	public static function formClass( $classes, $form ): string {
		return (string) $classes . ( FluentFormsEntry::isSignupForm( $form ) ? ' aworacle-ff-signup' : '' );
	}

	/**
	 * New fields, old looks: per field the styling settings and CSS class, and the whole submit button.
	 *
	 * @param array<string,mixed> $fields from fields()
	 * @param mixed               $old    the stored form_fields, decoded
	 * @return array<string,mixed>
	 */
	public static function keepLooks( array $fields, $old ): array {
		if ( ! is_array( $old ) ) {
			return $fields;
		}
		$byName = array();
		foreach ( (array) ( $old['fields'] ?? array() ) as $field ) {
			$name = (string) ( $field['attributes']['name'] ?? '' );
			if ( $name !== '' ) {
				$byName[ $name ] = $field;
			}
		}
		foreach ( $fields['fields'] as $i => $field ) {
			$was = $byName[ (string) ( $field['attributes']['name'] ?? '' ) ] ?? null;
			if ( $was === null ) {
				continue;
			}
			foreach ( self::LOOK_SETTINGS as $key ) {
				if ( isset( $was['settings'][ $key ] ) ) {
					$fields['fields'][ $i ]['settings'][ $key ] = $was['settings'][ $key ];
				}
			}
			if ( isset( $was['attributes']['class'] ) ) {
				$fields['fields'][ $i ]['attributes']['class'] = $was['attributes']['class'];
			}
		}
		if ( ! empty( $old['submitButton'] ) ) {
			$fields['submitButton'] = $old['submitButton'];
		}
		return $fields;
	}

	/** @return array<string,string> field name => its label in the current language */
	public static function labels(): array {
		return array(
			'email'        => __( 'E-mail', 'aware-wave-oracle' ),
			'calendar'     => __( 'Calendar', 'aware-wave-oracle' ),
			'leap_month'   => __( 'Leap month', 'aware-wave-oracle' ),
			'birth_year'   => __( 'Birth year', 'aware-wave-oracle' ),
			'birth_month'  => __( 'Birth month', 'aware-wave-oracle' ),
			'birth_day'    => __( 'Birth day', 'aware-wave-oracle' ),
			'birth_hour'   => __( 'Birth hour (0–23, local clock)', 'aware-wave-oracle' ),
			'birth_minute' => __( 'Birth minute', 'aware-wave-oracle' ),
			'gender'       => __( 'Gender', 'aware-wave-oracle' ),
			'aw_place'     => __( 'Birthplace', 'aware-wave-oracle' ),
			'true_solar'   => __( 'Use true solar time', 'aware-wave-oracle' ),
		);
	}

	/** @return array<string,array<string,string>> field name => option value => label */
	private static function options(): array {
		return array(
			'calendar'   => array(
				'solar' => __( 'Solar (Gregorian)', 'aware-wave-oracle' ),
				'lunar' => __( 'Lunar', 'aware-wave-oracle' ),
			),
			'gender'     => array(
				'男' => __( 'Male', 'aware-wave-oracle' ),
				'女' => __( 'Female', 'aware-wave-oracle' ),
			),
			'leap_month' => array( 'yes' => __( 'Leap month', 'aware-wave-oracle' ) ),
			'true_solar' => array( 'yes' => __( 'Use true solar time', 'aware-wave-oracle' ) ),
		);
	}

	/** The whole form_fields value. @return array<string,mixed> */
	public static function fields(): array {
		$labels = self::labels();
		$number = static function ( string $name, int $min, int $max ) use ( $labels ): array {
			return self::element(
				'input_number',
				array( 'type' => 'number', 'name' => $name, 'value' => '', 'min' => $min, 'max' => $max ),
				array(
					'label'            => $labels[ $name ],
					'number_step'      => '1',
					'validation_rules' => array(
						'required' => self::required(),
						// Without "numeric", Fluent Forms compares min and max against the text's length.
						'numeric'  => array( 'value' => true, 'message' => $labels[ $name ] . ': 0-9' ),
						'min'      => array( 'value' => $min, 'message' => $labels[ $name ] . ' ≥ ' . $min ),
						'max'      => array( 'value' => $max, 'message' => $labels[ $name ] . ' ≤ ' . $max ),
					),
				),
				'inputText'
			);
		};
		$choice = static function ( string $element, string $type, string $name, string $value ) use ( $labels ): array {
			$options = array();
			foreach ( self::options()[ $name ] as $v => $label ) {
				$options[] = array( 'label' => $label, 'value' => (string) $v, 'calc_value' => '', 'image' => '' );
			}
			return self::element(
				$element,
				array( 'type' => $type, 'name' => $name, 'value' => $type === 'checkbox' ? array() : $value ),
				array(
					'label'            => $type === 'checkbox' ? '' : $labels[ $name ],
					'advanced_options' => $options,
					// Not ff_list_buttons: Fluent Forms' always-loaded CSS paints it its own blue whatever the theme.
					'layout_class'     => $type === 'radio' ? 'ff_list_inline' : '',
					'validation_rules' => $type === 'radio' ? array( 'required' => self::required() ) : array(),
				),
				'inputCheckable'
			);
		};
		$hidden = static function ( string $name ): array {
			return self::element( 'input_hidden', array( 'type' => 'hidden', 'name' => $name, 'value' => '' ), array( 'admin_field_label' => $name ), 'inputHidden' );
		};
		$html   = static function ( string $codes ): array {
			return self::element( 'custom_html', array(), array( 'html_codes' => $codes ), 'customHTML' );
		};

		$fields = array(
			self::element(
				'input_email',
				array( 'type' => 'email', 'name' => 'email', 'value' => '' ),
				array(
					'label'            => $labels['email'],
					'validation_rules' => array(
						'required' => self::required(),
						'email'    => array( 'value' => true, 'message' => __( 'Enter a valid e-mail address.', 'aware-wave-oracle' ) ),
					),
				),
				'inputText'
			),
			$choice( 'input_radio', 'radio', 'calendar', 'solar' ),
			$choice( 'input_checkbox', 'checkbox', 'leap_month', '' ),
			$number( 'birth_year', 1800, 2200 ),
			$number( 'birth_month', 1, 12 ),
			$number( 'birth_day', 1, 31 ),
			$number( 'birth_hour', 0, 23 ),
			$number( 'birth_minute', 0, 59 ),
			$choice( 'input_radio', 'radio', 'gender', '男' ),
			$html( '<div class="aworacle-ff-place"></div>' ),
			$choice( 'input_checkbox', 'checkbox', 'true_solar', '' ),
			$html( '<div class="aworacle-ff-turnstile"></div>' ),
			$hidden( 'aw_place_label' ),
			$hidden( FluentFormsEntry::MARKER ),
			$hidden( 'aw_place_lon' ),
			$hidden( 'aw_place_zone' ),
			$hidden( 'aw_tz' ),
			$hidden( 'aw_locale' ),
			$hidden( 'aw_turnstile' ),
		);
		foreach ( $fields as $i => $field ) {
			$fields[ $i ]['index']     = $i;
			$fields[ $i ]['uniqElKey'] = 'el_aworacle_' . $i;
		}

		return array(
			'fields'       => $fields,
			'submitButton' => array(
				'uniqElKey'      => 'el_aworacle_submit',
				'element'        => 'button',
				'attributes'     => array( 'type' => 'submit', 'class' => 'button wp-element-button' ),
				'settings'       => array(
					'align'           => 'left',
					'button_style'    => 'default',
					'button_size'     => 'md',
					'container_class' => '',
					'help_message'    => '',
					'button_ui'       => array( 'type' => 'default', 'text' => __( 'Subscribe', 'aware-wave-oracle' ), 'img_url' => '' ),
				),
				'editor_options' => array( 'title' => 'Submit Button' ),
			),
		);
	}

	/**
	 * fluentform/rendering_form: the signup form in the page's language (words only; layout and styling stay as
	 * edited in Fluent Forms), plus the script that fills the hidden fields.
	 *
	 * @param mixed $form
	 * @return mixed
	 */
	public static function rendering( $form ) {
		if ( ! is_object( $form ) || ! FluentFormsEntry::isSignupForm( $form ) || ! isset( $form->fields['fields'] ) ) {
			return $form;
		}
		$labels  = self::labels();
		$options = self::options();
		$fields  = $form->fields;
		foreach ( $fields['fields'] as $i => $field ) {
			$name = (string) ( $field['attributes']['name'] ?? '' );
			if ( isset( $options[ $name ] ) ) {
				foreach ( (array) ( $field['settings']['advanced_options'] ?? array() ) as $j => $option ) {
					$value = (string) ( $option['value'] ?? '' );
					if ( isset( $options[ $name ][ $value ] ) ) {
						$fields['fields'][ $i ]['settings']['advanced_options'][ $j ]['label'] = $options[ $name ][ $value ];
					}
				}
			}
			if ( isset( $labels[ $name ] ) && ( $field['settings']['label'] ?? '' ) !== '' ) {
				$fields['fields'][ $i ]['settings']['label'] = $labels[ $name ];
			}
		}
		if ( isset( $fields['submitButton']['settings']['button_ui']['text'] ) ) {
			$fields['submitButton']['settings']['button_ui']['text'] = __( 'Subscribe', 'aware-wave-oracle' );
		}
		$form->fields = $fields;
		self::enqueue();
		return $form;
	}

	/**
	 * Creates or updates the signup form (needs Fluent Forms).
	 *
	 * ## EXAMPLES
	 *     wp aworacle daily-form
	 */
	public static function command(): void {
		$id = self::save();
		if ( $id === 0 ) {
			\WP_CLI::error( 'Fluent Forms is not active.' );
		}
		\WP_CLI::success( sprintf( 'Signup form %d is ready. Put [fluentform id="%d"] on the signup page.', $id, $id ) );
	}

	/** The form id, or 0 without Fluent Forms. */
	public static function save(): int {
		if ( ! class_exists( '\FluentForm\App\Models\Form' ) ) {
			return 0;
		}
		$form = self::existing();
		$now  = current_time( 'mysql' );
		$fields = $form ? self::keepLooks( self::fields(), json_decode( (string) $form->form_fields, true ) ) : self::fields();
		$data   = array(
			'status'      => 'published',
			'form_fields' => wp_json_encode( $fields, JSON_UNESCAPED_UNICODE ),
			'type'        => 'form',
			'has_payment' => 0,
			'updated_at'  => $now,
		);
		if ( $form ) {
			\FluentForm\App\Models\Form::where( 'id', $form->id )->update( $data );
			$id = (int) $form->id;
			$settings = \FluentForm\App\Models\FormMeta::retrieve( 'formSettings', $id );
		} else {
			$id = (int) \FluentForm\App\Models\Form::insertGetId(
				$data + array(
					'title'      => __( 'Daily fortune by e-mail', 'aware-wave-oracle' ),
					'created_by' => get_current_user_id(),
					'created_at' => $now,
				)
			);
			// Looks: written once, then the operator's.
			\FluentForm\App\Models\FormMeta::persist( $id, '_ff_selected_style', self::STYLE );
			$settings = null;
		}
		if ( ! is_array( $settings ) ) {
			$settings                                    = \FluentForm\App\Models\Form::getFormsDefaultSettings( $id );
			$settings['layout']['labelPlacement']        = 'top';
			$settings['layout']['errorMessagePlacement'] = 'inline';
		}
		// Backstop only, every time: nothing is inserted in the first place (FluentFormsEntry).
		$settings['delete_entry_on_submission'] = 'yes';
		\FluentForm\App\Models\FormMeta::persist( $id, 'formSettings', $settings );
		\FluentForm\App\Models\FormMeta::persist( $id, self::META, '1' );
		update_option( Options::OPTION, array_merge( Options::get(), array( 'fluentform_id' => $id ) ) );
		return $id;
	}

	/**
	 * Plugin deactivation / activation. Unpublishes every signup form (the configured one and any copy, the same
	 * rule as FluentFormsEntry::isSignupForm); activation publishes exactly those again.
	 */
	public static function setPublished( bool $published ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'fluentform_forms';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === null ) {
			return;
		}
		// Not through Fluent Forms' classes: it may be inactive at this moment.
		if ( $published ) {
			$ids = array_map( 'intval', (array) get_option( self::UNPUBLISHED_OPTION, array() ) );
		} else {
			$ids = array_map(
				'intval',
				$wpdb->get_col(
					$wpdb->prepare(
						"SELECT id FROM {$table} WHERE status = 'published' AND ( id = %d OR form_fields LIKE %s )", // phpcs:ignore WordPress.DB.PreparedSQL
						(int) ( Options::get()['fluentform_id'] ?? 0 ),
						'%' . $wpdb->esc_like( '"' . FluentFormsEntry::MARKER . '"' ) . '%'
					)
				)
			);
		}
		foreach ( $ids as $id ) {
			$wpdb->update( $table, array( 'status' => $published ? 'published' : 'unpublished' ), array( 'id' => $id ) );
		}
		if ( $published ) {
			delete_option( self::UNPUBLISHED_OPTION );
		} elseif ( $ids ) {
			update_option( self::UNPUBLISHED_OPTION, $ids, false );
		}
	}

	/** The configured form, else the one this plugin made earlier (the setting may have been cleared). */
	private static function existing() {
		$id = (int) ( Options::get()['fluentform_id'] ?? 0 );
		if ( $id > 0 ) {
			$form = \FluentForm\App\Models\Form::find( $id );
			if ( $form && FluentFormsEntry::isSignupForm( (object) array( 'id' => 0, 'form_fields' => $form->form_fields ) ) ) {
				return $form;
			}
		}
		$meta = \FluentForm\App\Models\FormMeta::where( 'meta_key', self::META )->first();
		return $meta ? \FluentForm\App\Models\Form::find( $meta->form_id ) : null;
	}

	private static function enqueue(): void {
		Renderer::enqueueFormStyle();
		$turnstile = Turnstile::siteKey();
		$deps      = array( 'jquery', Birthplace::enqueue() );
		if ( $turnstile !== '' ) {
			// Fluent Forms registers the same script as "turnstile"; one load is enough.
			wp_enqueue_script( 'turnstile', Turnstile::SCRIPT_URL, array(), null, true ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
			$deps[] = 'turnstile';
		}
		wp_enqueue_script( self::SCRIPT, AWORACLE_URL . 'assets/ff-daily.js', $deps, AWORACLE_VERSION, true );
		$config = array(
			'locale'    => Renderer::locale(),
			'turnstile' => $turnstile,
			'action'    => Turnstile::ACTION,
			'place'     => __( 'Birthplace', 'aware-wave-oracle' ),
		);
		wp_add_inline_script( self::SCRIPT, 'window.AWORACLE_FF=' . wp_json_encode( $config ) . ';', 'before' );
	}

	/** @return array<string,mixed> */
	private static function required(): array {
		return array( 'value' => true, 'message' => __( 'This field is required.', 'aware-wave-oracle' ) );
	}

	/**
	 * @param array<string,mixed> $attributes
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	private static function element( string $element, array $attributes, array $settings, string $template ): array {
		return array(
			'element'        => $element,
			'attributes'     => $attributes,
			'settings'       => $settings + array(
				'container_class'    => '',
				'label_placement'    => '',
				'help_message'       => '',
				'admin_field_label'  => '',
				'conditional_logics' => array(),
			),
			'editor_options' => array( 'template' => $template, 'title' => $element ),
		);
	}
}
