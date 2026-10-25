<?php
/**
 * Members over WordPress users. The account email is user_email (what verification proves), not the order's
 * billing email.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class WpMembers implements Members {

	public function member( int $userId ): ?array {
		$user = $userId > 0 ? get_userdata( $userId ) : false;
		if ( ! $user ) {
			return null;
		}
		return array(
			'email'          => (string) $user->user_email,
			'display_name'   => (string) $user->display_name,
			'verified_email' => (string) get_user_meta( $userId, EmailVerification::META_VERIFIED, true ),
		);
	}
}
