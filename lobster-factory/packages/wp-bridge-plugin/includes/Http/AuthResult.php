<?php
/**
 * AuthResult — the verdict of RequestAuthenticator for one request.
 *
 * Structured (not a bare bool) so the REST glue maps each outcome to the right HTTP status and the
 * audit log records a precise reason. On success it carries the resolved keyId + scope so downstream
 * handlers know who acted and at what privilege without re-resolving.
 *
 * Two reason fields exist on purpose: reason() is the COARSE code returned on the wire (several
 * distinct internal failures collapse to one, so the client cannot use the response as an oracle —
 * e.g. an unknown key and a stale-timestamp-on-a-known-key both report 'unknown_or_bad_signature').
 * auditReason() is the PRECISE code for the server-side log only, never sent to the client.
 *
 * @package AwareWave\WpBridge\Http
 */

namespace AwareWave\WpBridge\Http;

final class AuthResult {

	/** @var bool */
	private $authenticated;
	/** @var string|null resolved key id on success, null on failure. */
	private $keyId;
	/** @var string|null granted scope on success (read/write = the KEY's capability), null on failure. */
	private $scope;
	/** @var string COARSE wire reason, safe to return to the client. */
	private $reason;
	/** @var string PRECISE reason for the server log only — may differ from reason() to avoid oracles. */
	private $auditReason;
	/** @var int HTTP status the REST glue should return. */
	private $httpStatus;

	private function __construct( bool $authenticated, ?string $keyId, ?string $scope, string $reason, string $auditReason, int $httpStatus ) {
		$this->authenticated = $authenticated;
		$this->keyId         = $keyId;
		$this->scope         = $scope;
		$this->reason        = $reason;
		$this->auditReason   = $auditReason;
		$this->httpStatus    = $httpStatus;
	}

	public static function ok( string $keyId, string $scope ): self {
		return new self( true, $keyId, $scope, 'ok', 'ok', 200 );
	}

	/**
	 * @param string      $reason      coarse wire reason (returned to client).
	 * @param int         $httpStatus  HTTP status.
	 * @param string|null $auditReason precise server-log reason; defaults to $reason when not finer.
	 */
	public static function deny( string $reason, int $httpStatus, ?string $auditReason = null ): self {
		return new self( false, null, null, $reason, $auditReason ?? $reason, $httpStatus );
	}

	public function authenticated(): bool {
		return $this->authenticated;
	}

	public function keyId(): ?string {
		return $this->keyId;
	}

	public function scope(): ?string {
		return $this->scope;
	}

	public function reason(): string {
		return $this->reason;
	}

	/** Precise reason for the server-side audit log only. NEVER return this to the client. */
	public function auditReason(): string {
		return $this->auditReason;
	}

	public function httpStatus(): int {
		return $this->httpStatus;
	}
}
