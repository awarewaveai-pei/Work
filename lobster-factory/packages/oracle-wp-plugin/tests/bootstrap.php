<?php
/**
 * Composer autoloader when present (CI); otherwise a minimal PSR-4 fallback so the suite runs with
 * only the PHP CLI + ext-sodium (same arrangement as wp-bridge-plugin/tests/bootstrap.php).
 */

$composer = __DIR__ . '/../vendor/autoload.php';
if ( file_exists( $composer ) ) {
	require $composer;
	return;
}

spl_autoload_register(
	function ( $class ) {
		$prefix = 'AwareWave\\Oracle\\';
		if ( strpos( $class, $prefix ) !== 0 ) {
			return;
		}
		$relative = substr( $class, strlen( $prefix ) );
		$path     = __DIR__ . '/../includes/' . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_file( $path ) ) {
			require $path;
		}
	}
);
