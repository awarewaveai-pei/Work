<?php
/**
 * MediaSideloader — downloads an external image URL into the WordPress media library and returns its
 * attachment id + local URL. Kadence Image / Gallery blocks reference a media-library attachment id
 * (wp-image-<id>), so an AI-supplied image URL must be sideloaded first before it can become a real
 * Kadence image.
 *
 * @package AwareWave\WpBridge\Content
 */

namespace AwareWave\WpBridge\Content;

final class MediaSideloader {

	/**
	 * @return array{id:int,url:string}|null  null if the download/import failed.
	 */
	public function sideload( string $url, string $alt = '' ): ?array {
		if ( $url === '' ) {
			return null;
		}
		if ( ! function_exists( 'media_sideload_image' ) ) {
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
		}
		$id = media_sideload_image( $url, 0, $alt !== '' ? $alt : null, 'id' );
		if ( is_wp_error( $id ) || ! $id ) {
			return null;
		}
		$id  = (int) $id;
		$src = wp_get_attachment_url( $id );
		if ( ! $src ) {
			return null;
		}
		if ( $alt !== '' ) {
			update_post_meta( $id, '_wp_attachment_image_alt', sanitize_text_field( $alt ) );
		}
		return array( 'id' => $id, 'url' => (string) $src );
	}
}
