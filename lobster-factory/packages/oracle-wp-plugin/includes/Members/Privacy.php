<?php
/**
 * WordPress privacy tools and account deletion for the member tables (ORACLE-WP-SPEC §2-6):
 *  - Tools → Export Personal Data: both kinds, as two groups (charts, saved persons)
 *  - Tools → Erase Personal Data: every row of that member in both tables
 *  - deleting a user (single site), removing a user from a site, deleting them from the network
 *    (wpmu_delete_user: every site, member or not): the same erase
 *  - anything those events miss (plugin inactive at the time): Store::purgeOrphans(), daily and on install
 * Daily letter (P3): the profile(s) of this e-mail's FluentCRM contact and of the member's linked profiles are
 * exported (time zone, language, birth data) and erased with the same tools; deleting the member erases
 * the linked ones.
 * Signup entries Fluent Forms kept (Daily\FluentFormsEntries) are exported and erased by e-mail address.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

use AwareWave\Oracle\Daily\Crm;
use AwareWave\Oracle\Daily\FluentFormsEntries;
use AwareWave\Oracle\Daily\Store as DailyStore;
use AwareWave\Oracle\Crypto\Vault;
use AwareWave\Oracle\Settings\Options;

final class Privacy {

	const ID = 'aware-wave-oracle';

	public function register(): void {
		add_filter( 'wp_privacy_personal_data_exporters', array( $this, 'exporters' ) );
		add_filter( 'wp_privacy_personal_data_erasers', array( $this, 'erasers' ) );
		add_action( 'delete_user', array( self::class, 'onDeleteUser' ) );
		add_action( 'remove_user_from_blog', array( self::class, 'onRemoveFromBlog' ), 10, 2 );
		add_action( 'wpmu_delete_user', array( self::class, 'onNetworkDelete' ) );
		add_action( Store::PURGE_HOOK, array( Store::class, 'purgeOrphans' ) );
	}

	/** @param array<string,mixed> $exporters */
	public function exporters( $exporters ): array {
		$exporters = is_array( $exporters ) ? $exporters : array();
		$exporters[ self::ID ] = array(
			'exporter_friendly_name' => __( 'AwareWave Oracle', 'aware-wave-oracle' ),
			'callback'               => array( self::class, 'export' ),
		);
		return $exporters;
	}

	/** @param array<string,mixed> $erasers */
	public function erasers( $erasers ): array {
		$erasers = is_array( $erasers ) ? $erasers : array();
		$erasers[ self::ID ] = array(
			'eraser_friendly_name' => __( 'AwareWave Oracle', 'aware-wave-oracle' ),
			'callback'             => array( self::class, 'erase' ),
		);
		return $erasers;
	}

	/**
	 * Every row in one page (no list limit). Without the data key the rows cannot be read: the export
	 * fails with an error instead of handing over a file without the data.
	 *
	 * @return array{data:array<int,array<string,mixed>>,done:bool}|\WP_Error
	 */
	public static function export( string $email, int $page = 1 ) {
		$user  = get_user_by( 'email', $email );
		$empty = array(
			'data' => array(),
			'done' => true,
		);
		$daily = self::dailyProfiles( $email, $user ? (int) $user->ID : 0 );
		if ( $page > 1 ) {
			return $empty;
		}
		// Plain entries: no data key needed.
		$entries = array();
		foreach ( FluentFormsEntries::of( $email ) as $entry ) {
			$values = array(
				array(
					'name'  => __( 'Sent', 'aware-wave-oracle' ),
					'value' => $entry['created_at'],
				),
			);
			foreach ( $entry['fields'] as $name => $value ) {
				if ( strpos( (string) $name, '_' ) !== 0 ) {
					$values[] = array(
						'name'  => (string) $name,
						'value' => is_array( $value ) ? implode( ', ', array_filter( $value, 'is_scalar' ) ) : (string) $value,
					);
				}
			}
			foreach ( $entry['visit'] as $name => $value ) {
				$values[] = array(
					'name'  => $name,
					'value' => $value,
				);
			}
			$entries[] = array(
				'group_id'    => 'aworacle-signup-entries',
				'group_label' => __( 'Daily letter signup form entries', 'aware-wave-oracle' ),
				'item_id'     => 'aworacle-signup-entry-' . $entry['id'],
				'data'        => $values,
			);
		}
		$key    = Options::dataKey();
		$kinds  = $user ? array_values( array_filter( array_keys( Store::KINDS ), array( Store::class, 'tableExists' ) ) ) : array();
		$stored = count( $daily );
		foreach ( $kinds as $kind ) {
			$stored += count( Store::listFor( $kind, (int) $user->ID, '', true ) );
		}
		if ( $stored === 0 ) {
			return array(
				'data' => $entries,
				'done' => true,
			);
		}
		if ( $key === '' ) {
			return new \WP_Error( 'aworacle_export_no_key', __( 'AwareWave Oracle: this member has saved charts, but AWORACLE_DATA_KEY is missing or invalid in wp-config.php, so they cannot be exported.', 'aware-wave-oracle' ) );
		}
		$groups = array(
			'charts'  => __( 'Saved charts', 'aware-wave-oracle' ),
			'persons' => __( 'Saved people (private compatibility readings)', 'aware-wave-oracle' ),
		);
		$data = $entries;
		foreach ( $kinds as $kind ) {
			$label = $groups[ $kind ];
			foreach ( Store::listFor( $kind, (int) $user->ID, $key, true ) as $row ) {
				$data[] = array(
					'group_id'    => 'aworacle-' . $kind,
					'group_label' => $label,
					'item_id'     => 'aworacle-' . $kind . '-' . $row['id'],
					'data'        => self::fields( $row ),
				);
			}
		}
		foreach ( $daily as $profile ) {
			$data[] = array(
				'group_id'    => 'aworacle-daily',
				'group_label' => __( 'Daily fortune letter', 'aware-wave-oracle' ),
				'item_id'     => 'aworacle-daily-' . $profile['subscriber_id'],
				'data'        => self::dailyFields( $profile, $key ),
			);
		}
		return array(
			'data' => $data,
			'done' => true,
		);
	}

	/** @return array{items_removed:bool,items_retained:bool,messages:array<int,string>,done:bool} */
	public static function erase( string $email, int $page = 1 ): array {
		$user    = get_user_by( 'email', $email );
		$removed = $user ? Store::deleteAllFor( (int) $user->ID ) : 0;
		foreach ( self::dailyProfiles( $email, $user ? (int) $user->ID : 0 ) as $profile ) {
			$removed += DailyStore::deleteForSubscriber( (int) $profile['subscriber_id'] );
		}
		$removed += FluentFormsEntries::delete( $email );
		return array(
			'items_removed'  => $removed > 0,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/** @param int|string $userId */
	public static function onDeleteUser( $userId ): void {
		self::deleteEntriesOf( (int) $userId );
		Store::deleteAllFor( (int) $userId );
		DailyStore::deleteForUser( (int) $userId );
	}

	/**
	 * Network deletion: every site, because a former member (or one whose rows predate a removal) may
	 * still have rows on sites that get_blogs_of_user() no longer lists.
	 *
	 * @param int|string $userId
	 */
	public static function onNetworkDelete( $userId ): void {
		$page = 0;
		do {
			$ids = get_sites(
				array(
					'fields' => 'ids',
					'number' => 100,
					'offset' => 100 * $page++,
				)
			);
			foreach ( $ids as $id ) {
				switch_to_blog( (int) $id );
				self::deleteEntriesOf( (int) $userId );
				Store::deleteAllFor( (int) $userId );
				DailyStore::deleteForUser( (int) $userId );
				restore_current_blog();
			}
		} while ( count( $ids ) === 100 );
	}

	/**
	 * @param int|string $userId
	 * @param int|string $blogId
	 */
	public static function onRemoveFromBlog( $userId, $blogId ): void {
		$switch = is_multisite() && (int) $blogId !== get_current_blog_id();
		if ( $switch ) {
			switch_to_blog( (int) $blogId );
		}
		self::deleteEntriesOf( (int) $userId );
		Store::deleteAllFor( (int) $userId );
		DailyStore::deleteForUser( (int) $userId );
		if ( $switch ) {
			restore_current_blog();
		}
	}

	private static function deleteEntriesOf( int $userId ): void {
		$user = $userId > 0 ? get_userdata( $userId ) : false;
		if ( $user ) {
			FluentFormsEntries::delete( (string) $user->user_email );
		}
	}

	/**
	 * Daily profiles of this address's FluentCRM contact and of profiles linked to the member.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function dailyProfiles( string $email, int $userId ): array {
		if ( ! DailyStore::tablesExist() ) {
			return array();
		}
		$ids     = DailyStore::subscribersOfUser( $userId );
		$contact = Crm::findByEmail( strtolower( trim( $email ) ) );
		if ( $contact ) {
			$ids[] = $contact['id'];
		}
		$out = array();
		foreach ( array_unique( $ids ) as $id ) {
			$row = DailyStore::get( (int) $id );
			if ( $row ) {
				$out[] = $row;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $p a daily profile row
	 * @return array<int,array{name:string,value:string}>
	 */
	private static function dailyFields( array $p, string $key ): array {
		$id     = (int) $p['subscriber_id'];
		$active = $p['data'] ? Vault::open( (string) $p['data'], $key, DailyStore::activeContext( $id ) ) : null;
		$pend   = $p['pending_data'] ? Vault::open( (string) $p['pending_data'], $key, DailyStore::pendingContext( $id ) ) : null;
		$out    = array(
			array(
				'name'  => __( 'Status', 'aware-wave-oracle' ),
				'value' => (string) $p['status'],
			),
			array(
				'name'  => __( 'Time zone', 'aware-wave-oracle' ),
				'value' => (string) $p['tz'],
			),
			array(
				'name'  => __( 'Language', 'aware-wave-oracle' ),
				'value' => (string) $p['locale'],
			),
			array(
				'name'  => __( 'Saved at (UTC)', 'aware-wave-oracle' ),
				'value' => (string) $p['created_at'],
			),
		);
		foreach ( array( 'active' => $active, 'pending' => is_array( $pend ) ? ( $pend['birth'] ?? null ) : null ) as $which => $birth ) {
			if ( ! is_array( $birth ) ) {
				continue;
			}
			$row = array(
				'id'         => $id,
				'data'       => array(
					'name'  => $which === 'active' ? __( 'Daily letter', 'aware-wave-oracle' ) : __( 'Daily letter (waiting for confirmation)', 'aware-wave-oracle' ),
					'birth' => $birth,
				),
				'created_at' => (string) $p['created_at'],
				'updated_at' => (string) $p['updated_at'],
			);
			$out = array_merge( $out, array_slice( self::fields( $row ), 1 ) );
		}
		return $out;
	}

	/**
	 * @param array{id:int,data:array<string,mixed>|null,created_at:string,updated_at:string} $row
	 * @return array<int,array{name:string,value:string}>
	 */
	private static function fields( array $row ): array {
		$out = array(
			array(
				'name'  => __( 'Saved at (UTC)', 'aware-wave-oracle' ),
				'value' => $row['created_at'],
			),
		);
		if ( $row['data'] === null ) {
			$out[] = array(
				'name'  => __( 'Content', 'aware-wave-oracle' ),
				'value' => __( 'Encrypted; this site’s current key cannot open it (it was saved under another key).', 'aware-wave-oracle' ),
			);
			return $out;
		}
		$b     = is_array( $row['data']['birth'] ?? null ) ? $row['data']['birth'] : array();
		$place = is_array( $b['place'] ?? null ) ? $b['place'] : array();
		$out[] = array(
			'name'  => __( 'Name', 'aware-wave-oracle' ),
			'value' => (string) ( $row['data']['name'] ?? '' ),
		);
		$out[] = array(
			'name'  => __( 'Birth (local clock time)', 'aware-wave-oracle' ),
			'value' => sprintf(
				'%s %04d-%02d-%02d %02d:%02d%s',
				(string) ( $b['calendar'] ?? '' ),
				(int) ( $b['year'] ?? 0 ),
				(int) ( $b['month'] ?? 0 ),
				(int) ( $b['day'] ?? 0 ),
				(int) ( $b['hour'] ?? 0 ),
				(int) ( $b['minute'] ?? 0 ),
				! empty( $b['isLeapMonth'] ) ? ' (leap month)' : ''
			),
		);
		$out[] = array(
			'name'  => __( 'Gender', 'aware-wave-oracle' ),
			'value' => (string) ( $b['gender'] ?? '' ),
		);
		$out[] = array(
			'name'  => __( 'Birthplace', 'aware-wave-oracle' ),
			'value' => sprintf( '%s (%s, %s; %s)', (string) ( $place['label'] ?? '' ), (string) ( $place['lat'] ?? '' ), (string) ( $place['lon'] ?? '' ), (string) ( $place['zone'] ?? '' ) ),
		);
		return $out;
	}
}
