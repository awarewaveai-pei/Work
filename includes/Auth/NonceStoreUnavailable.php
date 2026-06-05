<?php
/**
 * NonceStoreUnavailable — raised when a NonceStore cannot prove whether a nonce is fresh.
 *
 * This is a DISTINCT signal from "nonce was reused" (which remember() reports by returning false).
 * It means the store itself failed: DB unreachable, table missing, query errored. The whole point
 * of a dedicated type is to force the coordinator to fail CLOSED — a store outage must reject
 * requests, never silently allow them (which would disable replay protection exactly when the
 * system is already degraded). See DESIGN §E + top-risk #3 (nonce store availability → fail-closed).
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class NonceStoreUnavailable extends \RuntimeException {
}
