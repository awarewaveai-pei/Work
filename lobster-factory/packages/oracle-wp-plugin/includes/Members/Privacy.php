<?php
/**
 * WordPress privacy tools and account deletion for the member tables (ORACLE-WP-SPEC §2-6):
 *  - Tools → Export Personal Data: both kinds, as two groups (charts, saved persons)
 *  - Tools → Erase Personal Data: every row of that member in both tables
 *  - deleting a user (single site), removing a user from a site, deleting them from the network
 *    (wpmu_delete_user: every site, member or not): the same erase
 *  - anything those events miss (plugin inactive at the time): Store::purgeOrphans(), daily and on install
 * P3 adds its daily-letter profile to the same exporter/eraser.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

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
		if ( ! $user || $page > 1 ) {
			return $empty;
		}
		$key    = Options::dataKey();
		$kinds  = array_values( array_filter( array_keys( Store::KINDS ), array( Store::class, 'tableExists' ) ) );
		$stored = 0;
		foreach ( $kinds as $kind ) {
			$stored += count( Store::listFor( $kind, (int) $user->ID, '', true ) );
		}
		if ( $stored === 0 ) {
			return $empty;
		}
		if ( $key === '' ) {
			return new \WP_Error( 'aworacle_export_no_key', __( 'AwareWave Oracle: this member has saved charts, but AWORACLE_DATA_KEY is missing or invalid in wp-config.php, so they cannot be exported.', 'aware-wave-oracle' ) );
		}
		$groups = array(
			'charts'  => __( 'Saved charts', 'aware-wave-oracle' ),
			'persons' => __( 'Saved people (private compatibility readings)', 'aware-wave-oracle' ),
		);
		$data = array();
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
		return array(
			'data' => $data,
			'done' => true,
		);
	}

	/** @return array{items_removed:bool,items_retained:bool,messages:array<int,string>,done:bool} */
	public static function erase( string $email, int $page = 1 ): array {
		$user    = get_user_by( 'email', $email );
		$removed = $user ? Store::deleteAllFor( (int) $user->ID ) : 0;
		return array(
			'items_removed'  => $removed > 0,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/** @param int|string $userId */
	public static function onDeleteUser( $userId ): void {
		Store::deleteAllFor( (int) $userId );
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
				Store::deleteAllFor( (int) $userId );
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
		Store::deleteAllFor( (int) $userId );
		if ( $switch ) {
			restore_current_blog();
		}
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
