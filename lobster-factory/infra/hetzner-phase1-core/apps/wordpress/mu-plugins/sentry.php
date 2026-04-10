<?php
/**
 * Plugin Name: Sentry Error Tracking (MU)
 * Description: Auto-loaded Sentry SDK initialisation — DSN from SENTRY_DSN env var.
 */

if (!getenv('SENTRY_DSN')) {
    return;
}

$autoload = __DIR__ . '/vendor/autoload.php';
if (!file_exists($autoload)) {
    return;
}
require_once $autoload;

\Sentry\init([
    'dsn'                  => getenv('SENTRY_DSN'),
    'environment'          => getenv('WP_ENV') ?: 'staging',
    'traces_sample_rate'   => 0.1,
    'send_default_pii'     => false,
]);
