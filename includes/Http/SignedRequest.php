<?php
/**
 * SignedRequest — the authentication-relevant fields of one incoming bridge request.
 *
 * The WordPress REST glue (a later, WP-coupled brick) extracts these from headers + body + the
 * connection, then hands this immutable value object to RequestAuthenticator. Keeping the parsing
 * (WP-coupled) separate from the decision (WP-free) is what lets the whole auth pipeline be unit
 * tested without WordPress, the same discipline as SignatureVerifier / KeyStore / NonceCache.
 *
 * @package AwareWave\WpBridge\Http
 */

namespace AwareWave\WpBridge\Http;

final class SignedRequest {

	/** @var string Controller key identifier (selects which public key to verify against). */
	private $keyId;
	/** @var string HTTP method, e.g. GET / POST. */
	private $method;
	/** @var string Request path WITHOUT scheme/host/query, e.g. /option/foo. */
	private $path;
	/** @var int Client-supplied unix timestamp the signature is bound to. */
	private $timestamp;
	/** @var string Single-use nonce the signature is bound to. */
	private $nonce;
	/** @var string Raw request body (hashed into the signature; never embedded raw). */
	private $body;
	/** @var string Base64 Ed25519 signature over the canonical request. */
	private $signatureBase64;
	/**
	 * @var string Client IP for the key's IP allowlist. CONTRACT the WP glue MUST uphold: this must
	 * be the VERIFIED peer address (REMOTE_ADDR), or — behind the known Cloudflare front — the
	 * CF-Connecting-IP validated against Cloudflare's published ranges. It must NEVER be a raw
	 * client-controllable header (X-Forwarded-For / X-Real-IP), or the IP allowlist is trivially
	 * spoofable and worthless. ipAllowed() does an exact-string match on whatever it is given.
	 */
	private $clientIp;

	public function __construct(
		string $keyId,
		string $method,
		string $path,
		int $timestamp,
		string $nonce,
		string $body,
		string $signatureBase64,
		string $clientIp
	) {
		$this->keyId           = $keyId;
		$this->method          = $method;
		$this->path            = $path;
		$this->timestamp       = $timestamp;
		$this->nonce           = $nonce;
		$this->body            = $body;
		$this->signatureBase64 = $signatureBase64;
		$this->clientIp        = $clientIp;
	}

	public function keyId(): string {
		return $this->keyId;
	}

	public function method(): string {
		return $this->method;
	}

	public function path(): string {
		return $this->path;
	}

	public function timestamp(): int {
		return $this->timestamp;
	}

	public function nonce(): string {
		return $this->nonce;
	}

	public function body(): string {
		return $this->body;
	}

	public function signatureBase64(): string {
		return $this->signatureBase64;
	}

	public function clientIp(): string {
		return $this->clientIp;
	}
}
