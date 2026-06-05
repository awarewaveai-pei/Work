<?php
/**
 * KeyRecord — one registered controller key, as the site knows it.
 *
 * The site stores ONLY public keys (the private key lives in the controller's vault — see
 * SignatureVerifier). A KeyRecord is the immutable description the Router needs to decide, for an
 * authenticated request, whether this particular key is allowed to do this particular thing:
 *   - which Ed25519 public key to verify the signature against (publicKeyBase64),
 *   - whether the key may write or only read (scope) — read/write separation shrinks blast radius,
 *   - whether the key is currently usable (status) — supports rotation (active overlap) and instant
 *     revocation,
 *   - whether the caller's IP is permitted (ipAllowlist) — empty list means "any IP".
 *
 * Value object: no WordPress dependency, immutable, unit-testable in isolation (same discipline as
 * SignatureVerifier / NonceCache). Enforcement lives in the Router; this type only answers questions.
 *
 * @package AwareWave\WpBridge\Auth
 */

namespace AwareWave\WpBridge\Auth;

final class KeyRecord {

	/** Read-only key: may call read endpoints, never write. */
	public const SCOPE_READ = 'read';
	/** Read-write key: may call read AND write endpoints (write implies read). */
	public const SCOPE_WRITE = 'write';

	/** Key is usable right now. */
	public const STATUS_ACTIVE = 'active';
	/** Key still verifies during a rotation grace window but should be phased out. Treated as usable. */
	public const STATUS_RETIRING = 'retiring';
	/** Key is permanently disabled — never usable, even if the signature is valid. */
	public const STATUS_REVOKED = 'revoked';

	/** @var string Controller-chosen identifier sent in each request to select the key. */
	private $keyId;
	/** @var string Ed25519 public key, base64-encoded (32 raw bytes). */
	private $publicKeyBase64;
	/** @var string One of SCOPE_*. */
	private $scope;
	/** @var string One of STATUS_*. */
	private $status;
	/** @var string[] Allowed client IPs; empty array = any IP. */
	private $ipAllowlist;

	/**
	 * @param string[] $ipAllowlist
	 */
	public function __construct( string $keyId, string $publicKeyBase64, string $scope, string $status, array $ipAllowlist = array() ) {
		$this->keyId           = $keyId;
		$this->publicKeyBase64 = $publicKeyBase64;
		// Unknown scope/status must degrade to the SAFE option, never the permissive one.
		$this->scope           = ( $scope === self::SCOPE_WRITE ) ? self::SCOPE_WRITE : self::SCOPE_READ;
		$this->status          = in_array( $status, array( self::STATUS_ACTIVE, self::STATUS_RETIRING, self::STATUS_REVOKED ), true )
			? $status
			: self::STATUS_REVOKED;
		$this->ipAllowlist     = array_values( array_filter( $ipAllowlist, 'is_string' ) );
	}

	public function keyId(): string {
		return $this->keyId;
	}

	public function publicKeyBase64(): string {
		return $this->publicKeyBase64;
	}

	public function scope(): string {
		return $this->scope;
	}

	public function status(): string {
		return $this->status;
	}

	/** Usable iff not revoked. Active and retiring both verify (retiring = rotation grace). */
	public function isUsable(): bool {
		return $this->status !== self::STATUS_REVOKED;
	}

	/** May this key perform READ operations? (Any usable key can read.) */
	public function allowsRead(): bool {
		return $this->isUsable();
	}

	/** May this key perform WRITE operations? (Usable AND write-scoped.) */
	public function allowsWrite(): bool {
		return $this->isUsable() && $this->scope === self::SCOPE_WRITE;
	}

	/**
	 * Is $clientIp permitted by this key's allowlist? An empty allowlist means "any IP".
	 * Comparison is exact-string (CIDR support, if ever needed, is a deliberate later addition).
	 */
	public function ipAllowed( string $clientIp ): bool {
		if ( $this->ipAllowlist === array() ) {
			return true;
		}
		return in_array( $clientIp, $this->ipAllowlist, true );
	}
}
