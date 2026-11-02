<?php
/**
 * ContactUpserter — upserts one FluentCRM contact (email is the unique key) and attaches lists / tags.
 *
 * RED LINE: no automation sequences, no campaign, no mail. A new contact is created `subscribed` (the caller has
 * already established consent); an existing contact keeps its status, so an unsubscribed person is never re-subscribed
 * by a sync. Lists and tags are matched by title and created when missing.
 *
 * @package AwareWave\WpBridge\Crm
 */

namespace AwareWave\WpBridge\Crm;

final class ContactUpserter {

	private const SUBSCRIBER_MODEL = '\FluentCrm\App\Models\Subscriber';
	private const LIST_MODEL       = '\FluentCrm\App\Models\Lists';
	private const TAG_MODEL        = '\FluentCrm\App\Models\Tag';

	/**
	 * @param array<string,mixed> $spec {
	 *     @type string   $email      Required.
	 *     @type string   $first_name Optional.
	 *     @type string   $last_name  Optional.
	 *     @type string   $phone      Optional.
	 *     @type string[] $lists      List titles to attach.
	 *     @type string[] $tags       Tag titles to attach.
	 * }
	 * @return array<string,mixed> status=committed|failed plus contact_id/created or reason.
	 */
	public function upsert( array $spec ): array {
		if ( ! class_exists( self::SUBSCRIBER_MODEL ) ) {
			return array( 'status' => 'failed', 'reason' => 'fluentcrm_not_active' );
		}

		$email = isset( $spec['email'] ) ? strtolower( trim( (string) $spec['email'] ) ) : '';
		if ( $email === '' || ! is_email( $email ) ) {
			return array( 'status' => 'failed', 'reason' => 'email_required' );
		}

		$model = self::SUBSCRIBER_MODEL;
		try {
			$contact = $model::where( 'email', $email )->first();
			$created = false;
			if ( ! $contact ) {
				$data = array( 'email' => $email, 'status' => 'subscribed' );
				foreach ( array( 'first_name', 'last_name', 'phone' ) as $field ) {
					if ( ! empty( $spec[ $field ] ) ) {
						$data[ $field ] = trim( (string) $spec[ $field ] );
					}
				}
				$contact = $model::create( $data );
				$created = true;
			} else {
				// Fill only blanks: a contact the operator already edited in FluentCRM is not overwritten.
				$patch = array();
				foreach ( array( 'first_name', 'last_name', 'phone' ) as $field ) {
					if ( empty( $contact->$field ) && ! empty( $spec[ $field ] ) ) {
						$patch[ $field ] = trim( (string) $spec[ $field ] );
					}
				}
				if ( $patch ) {
					$contact->fill( $patch );
					$contact->save();
				}
			}

			if ( ! $contact || empty( $contact->id ) ) {
				return array( 'status' => 'failed', 'reason' => 'create_failed' );
			}

			$listIds = $this->ids( self::LIST_MODEL, $this->titles( $spec['lists'] ?? array() ) );
			$tagIds  = $this->ids( self::TAG_MODEL, $this->titles( $spec['tags'] ?? array() ) );
			if ( $listIds ) {
				$contact->attachLists( $listIds );
			}
			if ( $tagIds ) {
				$contact->attachTags( $tagIds );
			}
		} catch ( \Throwable $e ) {
			return array( 'status' => 'failed', 'reason' => 'upsert_failed', 'detail' => $e->getMessage() );
		}

		return array(
			'status'         => 'committed',
			'contact_id'     => (int) $contact->id,
			'created'        => $created,
			'contact_status' => (string) $contact->status,
		);
	}

	/**
	 * @param mixed $raw
	 * @return string[]
	 */
	private function titles( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $t ) {
			$t = trim( (string) $t );
			if ( $t !== '' ) {
				$out[ $t ] = $t;
			}
		}
		return array_values( $out );
	}

	/**
	 * Ids of the named lists/tags, creating the missing ones.
	 *
	 * @param string[] $titles
	 * @return int[]
	 */
	private function ids( string $model, array $titles ): array {
		$ids = array();
		foreach ( $titles as $title ) {
			$row = $model::where( 'title', $title )->first();
			if ( ! $row ) {
				$row = $model::create( array( 'title' => $title, 'slug' => sanitize_title( $title ) ) );
			}
			if ( $row && ! empty( $row->id ) ) {
				$ids[] = (int) $row->id;
			}
		}
		return $ids;
	}
}
