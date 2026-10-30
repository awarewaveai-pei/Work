<?php
/**
 * 「用 Google 註冊」 through Nextend Social Login (free; operator 2026-10-30). A new member Google made counts as
 * email-verified only when Google itself owns the address: a gmail.com / googlemail.com account equal to the member's
 * email. Any other address on a Google account may never have been proven to Google, so that member gets the normal
 * verification mail (EmailVerification, sent on user_register) like anyone else. Decision
 * agency-os/reports/decisions/2026-10-30-customer-self-signup-email-google.md §6.
 *
 * Hook: nsl_google_register_new_user( $user_id, $provider ) -- social-login.nextendweb.com/documentation/for-developers/hooks/
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class GoogleSignup {

	/** The member's email is proven by Google: a Google-hosted mailbox, the same address. */
	public static function provenByGoogle( string $googleEmail, string $memberEmail ): bool {
		$g = EmailVerification::normalizeEmail( $googleEmail );
		if ( $g === '' || $g !== EmailVerification::normalizeEmail( $memberEmail ) ) {
			return false;
		}
		$domain = substr( (string) strrchr( $g, '@' ), 1 );
		return $domain === 'gmail.com' || $domain === 'googlemail.com';
	}

	public function register(): void {
		add_action( 'nsl_google_register_new_user', array( $this, 'onRegister' ), 10, 2 );
	}

	public function onRegister( $userId, $provider ): void {
		$uid  = (int) $userId;
		$user = $uid > 0 ? get_userdata( $uid ) : false;
		if ( ! $user || ! is_object( $provider ) || ! method_exists( $provider, 'getAuthUserData' ) ) {
			return;
		}
		if ( ! self::provenByGoogle( (string) $provider->getAuthUserData( 'email' ), (string) $user->user_email ) ) {
			return;
		}
		update_user_meta( $uid, EmailVerification::META_VERIFIED, EmailVerification::normalizeEmail( (string) $user->user_email ) );
		delete_user_meta( $uid, EmailVerification::META_PENDING );
		do_action( WelcomeGift::VERIFIED, $uid );
	}
}
