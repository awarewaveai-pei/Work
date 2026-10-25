<?php
/**
 * Test bootstrap. Uses composer's autoloader when present (CI), and falls back to a minimal
 * PSR-4 autoloader so the suite also runs on a machine without composer installed.
 */

$composer = __DIR__ . '/../vendor/autoload.php';
if ( file_exists( $composer ) ) {
	require $composer;
	return;
}

// Fallback: map AwareWave\Store\... -> includes/...  (production classes only).
spl_autoload_register(
	function ( $class ) {
		$prefix = 'AwareWave\\Store\\';
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
