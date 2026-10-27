<?php
// Standalone regression: a password-only event must not become a completed login.
namespace {
    class WP_User { public $ID = 1; }
    $hook_active = false;
    $hooks = [];
    function has_action($hook, $callback) { return $GLOBALS['hook_active'] ? 20 : false; }
    function add_filter($hook, $callback, $priority, $args) { $GLOBALS['hooks'][$hook] = $callback; }
    function add_action($hook, $callback, $priority, $args) { $GLOBALS['hooks'][$hook] = $callback; }
    function check($condition, $message) {
        if (!$condition) { throw new \RuntimeException($message); }
        echo "PASS: $message\n";
    }
    require __DIR__ . '/../../apps/wordpress/mu-plugins/aw-login-audit.php';
    $user = new WP_User();
    check(!\AwareWave\LoginAudit\pending_second_factor(false, $user), 'absent WP 2FA leaves ordinary logging enabled');
    \AwareWave\LoginAudit\completed_second_factor($user);
}
namespace WP2FA\Admin\Helpers {
    class User_Helper {
        public static $enabled = true;
        public static $excluded = false;
        public static function run_user_exclusion_check($user) { return self::$excluded; }
        public static function is_user_using_two_factor($user) { return self::$enabled; }
    }
}
namespace Simple_History\Loggers {
    class User_Logger {
        public $events = [];
        public function log_two_factor_login($user, $slug) { $this->events[] = [$user->ID, $slug]; }
    }
}
namespace Simple_History {
    class Simple_History {
        public static $logger;
        public static function get_instance() { return new self(); }
        public function get_instantiated_logger_by_slug($slug) { return self::$logger; }
    }
}
namespace {
    $GLOBALS['hook_active'] = true;
    $pending = $GLOBALS['hooks']['simple_history/user_logger/login_pending_second_factor'];
    $completed = $GLOBALS['hooks']['wp_2fa_user_authenticated'];
    $logger = new \Simple_History\Loggers\User_Logger();
    \Simple_History\Simple_History::$logger = $logger;
    check($pending(false, $user), 'password-only login waits for second factor');
    check(count($logger->events) === 0, 'pending login creates no completed-login event');
    $completed($user);
    check($logger->events === [[1, 'wp-2fa']], 'accepted second factor records one login with provider');
    check($pending(true, null), 'another provider pending decision survives');
    check(!$pending(false, null), 'invalid user is ignored');
    \WP2FA\Admin\Helpers\User_Helper::$enabled = false;
    check(!$pending(false, $user), 'users without second factor retain ordinary logging');
    $GLOBALS['hook_active'] = false;
    \WP2FA\Admin\Helpers\User_Helper::$enabled = true;
    check(!$pending(false, $user), 'inactive challenge cannot suppress ordinary login audit');
    $GLOBALS['hook_active'] = true;
    \WP2FA\Admin\Helpers\User_Helper::$excluded = true;
    check(!$pending(false, $user), 'policy-excluded user retains ordinary completed-login audit');
    \WP2FA\Admin\Helpers\User_Helper::$excluded = false;
    $completed(null);
    check(count($logger->events) === 1, 'invalid completion cannot manufacture an event');
    \Simple_History\Simple_History::$logger = null;
    $completed($user);
    check(count($logger->events) === 1, 'missing logger is harmless');
}
