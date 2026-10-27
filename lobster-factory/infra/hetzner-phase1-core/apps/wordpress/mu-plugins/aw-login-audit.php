<?php
/**
 * Plugin Name: AwareWave 2FA Login Audit
 * Description: Records WP 2FA logins only after the second factor succeeds.
 */

namespace AwareWave\LoginAudit;

// wp_login fires before WP 2FA withdraws the password-only session.
function pending_second_factor($pending, $user) {
    if ($pending || !($user instanceof \WP_User)) {
        return $pending;
    }
    return class_exists('WP2FA\\Admin\\Helpers\\User_Helper')
        && false !== has_action('wp_login', ['WP2FA\\Authenticator\\Login', 'wp_login'])
        && !\WP2FA\Admin\Helpers\User_Helper::run_user_exclusion_check($user)
        && \WP2FA\Admin\Helpers\User_Helper::is_user_using_two_factor($user);
}

function completed_second_factor($user) {
    if (!($user instanceof \WP_User) || !class_exists('Simple_History\\Simple_History')) {
        return;
    }
    $logger = \Simple_History\Simple_History::get_instance()
        ->get_instantiated_logger_by_slug('SimpleUserLogger');
    if ($logger instanceof \Simple_History\Loggers\User_Logger) {
        $logger->log_two_factor_login($user, 'wp-2fa');
    }
}

add_filter('simple_history/user_logger/login_pending_second_factor', __NAMESPACE__ . '\\pending_second_factor', 10, 2);
add_action('wp_2fa_user_authenticated', __NAMESPACE__ . '\\completed_second_factor', 10, 1);
