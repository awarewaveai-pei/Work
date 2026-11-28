<?php
/**
 * What Fluent Forms may hold of the signup (setting fluentform_keep_entries), and how it is removed.
 * Fluent Forms 6.2.17 registers no WordPress privacy exporter or eraser, so the plugin's own cover these
 * entries (Members\Privacy), and every flow that removes a person's daily data removes them too.
 * Only the signup forms (the configured one and copies with our birthplace field) are ever touched.
 * Reads the tables directly: entries must stay removable while Fluent Forms is inactive.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Settings\Options;

final class FluentFormsEntries {

	/** The operator's choice; off unless they turned it on. */
	public static function kept(): bool {
		return ! empty( Options::get()['fluentform_keep_entries'] );
	}

	/** @return array<int,int> signup form ids, optionally only those with this status */
	public static function formIds( string $status = '' ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'fluentform_forms';
		if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === null ) {
			return array();
		}
		$sql  = "SELECT id FROM {$table} WHERE ( id = %d OR form_fields LIKE %s )";
		$args = array(
			(int) ( Options::get()['fluentform_id'] ?? 0 ),
			'%' . $wpdb->esc_like( '"' . FluentFormsEntry::MARKER . '"' ) . '%',
		);
		if ( $status !== '' ) {
			$sql   .= ' AND status = %s';
			$args[] = $status;
		}
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( $sql, ...$args ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
	}

	/**
	 * Entries of the signup forms whose e-mail field is this address (trashed ones included).
	 *
	 * `visit` = what Fluent Forms records next to the fields (address, browser, page).
	 *
	 * @return array<int,array{id:int,form_id:int,created_at:string,fields:array<string,mixed>,visit:array<string,string>}>
	 */
	public static function of( string $email ): array {
		global $wpdb;
		$email = strtolower( trim( $email ) );
		$forms = $email === '' ? array() : self::formIds();
		if ( ! $forms ) {
			return array();
		}
		// The column holds JSON as Fluent Forms writes it ("/" becomes "\/"): look for the same spelling.
		$stored = trim( (string) wp_json_encode( $email, JSON_UNESCAPED_UNICODE ), '"' );
		$rows   = (array) $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, form_id, response, created_at, ip, browser, device, country, source_url FROM {$wpdb->prefix}fluentform_submissions WHERE form_id IN (" . implode( ',', $forms ) . ') AND response LIKE %s', // phpcs:ignore WordPress.DB.PreparedSQL
				'%' . $wpdb->esc_like( $stored ) . '%'
			),
			ARRAY_A
		);
		$out  = array();
		foreach ( $rows as $row ) {
			$fields = json_decode( (string) $row['response'], true );
			// The LIKE only narrows: the address must be the e-mail field itself (not part of a longer one).
			if ( ! is_array( $fields ) || ! is_string( $fields['email'] ?? null ) || strtolower( trim( $fields['email'] ) ) !== $email ) {
				continue;
			}
			$out[] = array(
				'id'         => (int) $row['id'],
				'form_id'    => (int) $row['form_id'],
				'created_at' => (string) $row['created_at'],
				'fields'     => $fields,
				'visit'      => array_filter(
					array(
						'ip'         => (string) ( $row['ip'] ?? '' ),
						'browser'    => (string) ( $row['browser'] ?? '' ),
						'device'     => (string) ( $row['device'] ?? '' ),
						'country'    => (string) ( $row['country'] ?? '' ),
						'source_url' => (string) ( $row['source_url'] ?? '' ),
					),
					'strlen'
				),
			);
		}
		return $out;
	}

	/** Removes those entries with their details, meta and logs. Returns how many entries went. */
	public static function delete( string $email ): int {
		global $wpdb;
		$found = self::of( $email );
		foreach ( $found as $entry ) {
			if ( class_exists( '\FluentForm\App\Services\Submission\SubmissionService' ) ) {
				( new \FluentForm\App\Services\Submission\SubmissionService() )->deleteEntries( array( $entry['id'] ), $entry['form_id'] );
				continue;
			}
			$wpdb->delete( $wpdb->prefix . 'fluentform_entry_details', array( 'submission_id' => $entry['id'] ) );
			$wpdb->delete( $wpdb->prefix . 'fluentform_submission_meta', array( 'response_id' => $entry['id'] ) );
			$wpdb->delete( $wpdb->prefix . 'fluentform_logs', array( 'source_type' => 'submission_item', 'source_id' => $entry['id'] ) );
			$wpdb->delete( $wpdb->prefix . 'fluentform_submissions', array( 'id' => $entry['id'] ) );
		}
		return count( $found );
	}

	/**
	 * Fluent Forms Pro deletes an entry after submission when the form says so
	 * (formSettings delete_entry_on_submission): "yes" is the backstop while entries are not kept, and must be
	 * "no" while they are. Runs when the settings change and from `wp aworacle daily-form`.
	 */
	public static function syncRetention(): void {
		global $wpdb;
		$value = self::kept() ? 'no' : 'yes';
		$table = $wpdb->prefix . 'fluentform_form_meta';
		foreach ( self::formIds() as $id ) {
			$row      = $wpdb->get_row( $wpdb->prepare( "SELECT id, value FROM {$table} WHERE form_id = %d AND meta_key = %s", $id, 'formSettings' ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
			$settings = $row ? json_decode( (string) $row['value'], true ) : null;
			if ( is_array( $settings ) && ( $settings['delete_entry_on_submission'] ?? '' ) !== $value ) {
				$settings['delete_entry_on_submission'] = $value;
				$wpdb->update( $table, array( 'value' => wp_json_encode( $settings ) ), array( 'id' => (int) $row['id'] ) );
			}
		}
	}
}
