<?php
/**
 * Renderer — renders a URL while BYPASSING every cache layer, returning a RenderObservation.
 *
 * Cache-bypass is essential: verifying against a cached page would confirm the OLD output and let a
 * broken write "pass". The concrete implementation renders the truth source (the bridge's own
 * uncached render path); this interface lets the verify/rollback logic be tested with a fake that
 * returns scripted observations.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

interface Renderer {

	/**
	 * Render $url bypassing caches. On a transport failure it MUST throw (the transaction treats an
	 * unobservable render as verify-failure → rollback; it never assumes success it could not see).
	 */
	public function render( string $url ): RenderObservation;
}
