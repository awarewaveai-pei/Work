<?php
/**
 * Cloudflare Turnstile on the daily-letter signup form (optional).
 * On only when both keys are set: the site key (setting turnstile_site_key, public) and the secret
 * (wp-config.php AWORACLE_TURNSTILE_SECRET, or the non-autoloaded option aworacle_turnstile_secret).
 * Off or half set: the form keeps working on the rate limits, the trap field and the daily confirmation cap,
 * and the admin is told the check is not set up (SettingsPage).
 * On: Rest::subscribe asks Cloudflare's fixed siteverify address before anything is stored or mailed; any
 * answer other than success:true — error, timeout, redirect, non-200 — is a failure.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

use AwareWave\Oracle\Settings\Options;

final class Turnstile {

	const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
	const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
	const TIMEOUT    = 5;
	/** Widget action (assets/daily.js); a token minted for another form on the site carries a different one. */
	const ACTION = 'aworacle-daily';
	/** Cloudflare tokens are up to 2048 characters. */
	const TOKEN_MAX = 2048;

	/** 'on' (both keys), 'partial' (one of them) or 'off'. */
	public static function status(): string {
		$site   = Options::get()['turnstile_site_key'] !== '';
		$secret = Options::turnstileSecret() !== '';
		return ( $site && $secret ) ? 'on' : ( ( $site || $secret ) ? 'partial' : 'off' );
	}

	public static function siteKey(): string {
		return self::status() === 'on' ? Options::get()['turnstile_site_key'] : '';
	}

	/** Server-side check of the widget's token. False on anything but a clear success. */
	public static function verify( string $token, string $ip ): bool {
		$secret = Options::turnstileSecret();
		if ( $secret === '' || $token === '' || strlen( $token ) > self::TOKEN_MAX ) {
			return false;
		}
		$body = array(
			'secret'   => $secret,
			'response' => $token,
		);
		if ( $ip !== '' ) {
			$body['remoteip'] = $ip;
		}
		$res = wp_remote_post(
			self::VERIFY_URL,
			array(
				'timeout'             => self::TIMEOUT,
				'redirection'         => 0,
				'limit_response_size' => 65536,
				'body'                => $body,
			)
		);
		if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) {
			return false;
		}
		return self::passed( json_decode( (string) wp_remote_retrieve_body( $res ), true ) );
	}

	/**
	 * success must be exactly true; an action, when Cloudflare reports one, must be this form's.
	 * (Cloudflare's test secrets answer without an action. The hostname is not compared: the site key's own
	 * domain list at Cloudflare decides where the widget runs.)
	 *
	 * @param mixed $json decoded siteverify answer
	 */
	public static function passed( $json ): bool {
		if ( ! is_array( $json ) || ( $json['success'] ?? null ) !== true ) {
			return false;
		}
		return ! isset( $json['action'] ) || $json['action'] === '' || $json['action'] === self::ACTION;
	}
}
