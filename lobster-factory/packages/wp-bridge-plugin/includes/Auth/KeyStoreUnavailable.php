<?php
/**
 * KeyStoreUnavailable — raised when a KeyStore cannot be reached to resolve a key_id.
 *
 * Distinct from "key not found" (which resolve() reports by returning null). A store outage must
 * make the request FAIL CLOSED (reject), never be mistaken for "unknown key" in a probeable way and
 * never fall through to allow. Same fail-closed posture as NonceStoreUnavailable.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class KeyStoreUnavailable extends \RuntimeException {
}
