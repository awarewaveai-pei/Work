<?php
/**
 * NonceStore — atomic single-use storage contract for replay protection.
 *
 * SignatureVerifier proves a request is authentic and time-boxed, but it deliberately does NOT
 * check whether a (valid, in-window) signature has already been used — see SignatureVerifier::verify()
 * docblock. Without that check, a captured-but-valid request can be replayed any number of times
 * inside the timestamp window. Closing that hole needs STATE: a record of nonces already spent.
 *
 * This interface is that state, abstracted so the coordinator (NonceCache) stays storage-agnostic
 * and unit-testable with an in-memory implementation, exactly like SignatureVerifier is WP-free.
 *
 * The ONE invariant every implementation must uphold: remember() is an ATOMIC check-and-set.
 * Two concurrent requests presenting the same nonce must result in exactly ONE call returning true.
 * A non-atomic "read then write" is a replay hole and is forbidden.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

interface NonceStore {

	/**
	 * Atomically record $nonce as used, if and only if it was not already present.
	 *
	 * @param string $nonce     The client-presented nonce (already length/charset-checked by the caller).
	 * @param int    $expiresAt Unix time after which this nonce row may be garbage-collected. It is a
	 *                          STORAGE hint only — it never re-permits a nonce. (A nonce presented again
	 *                          after expiry is independently rejected upstream by the timestamp window,
	 *                          so GC cannot open a replay hole. Defense in depth, not the primary guard.)
	 *
	 * @return bool true  if THIS call was the first to record the nonce (the request is fresh);
	 *              false if the nonce was already present (a replay — reject the request).
	 *
	 * @throws NonceStoreUnavailable if the backing store cannot be reached or the write cannot be
	 *         proven to have succeeded. Callers MUST treat the exception as "cannot prove freshness"
	 *         and FAIL CLOSED (reject), never assume fresh. Silently swallowing this is a replay hole.
	 */
	public function remember( string $nonce, int $expiresAt ): bool;
}
