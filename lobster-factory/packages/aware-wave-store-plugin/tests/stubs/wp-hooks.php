<?php
/**
 * Just enough WordPress for StoreModule::register() to run in a unit test: records hook names, serves options from
 * $GLOBALS['awstore_test_options']. Loaded only by StoreModuleTest, inside its own process.
 */

$GLOBALS['awstore_test_hooks'] = array();

function add_action( $hook, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['awstore_test_hooks'][] = $hook;
	return true;
}

function add_filter( $hook, $callback, $priority = 10, $args = 1 ) {
	return add_action( $hook, $callback, $priority, $args );
}

function get_option( $name, $default = false ) {
	return $GLOBALS['awstore_test_options'][ $name ] ?? $default;
}
