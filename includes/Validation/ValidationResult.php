<?php
/**
 * ValidationResult — the outcome of a validator: valid, or a list of Violations. Returned by the
 * Kadence/Woo validators and mapped by the REST glue to a 422 with the violation list when invalid,
 * so the AI gets precise, machine-readable fix hints instead of a silent broken render.
 *
 * @package AwareWave\WpBridge\Validation
 */

namespace AwareWave\WpBridge\Validation;

final class ValidationResult {

	/** @var Violation[] */
	private $violations;

	/** @param Violation[] $violations */
	private function __construct( array $violations ) {
		$this->violations = $violations;
	}

	public static function ok(): self {
		return new self( array() );
	}

	/** @param Violation[] $violations */
	public static function fail( array $violations ): self {
		return new self( array_values( $violations ) );
	}

	public function isValid(): bool {
		return $this->violations === array();
	}

	/** @return Violation[] */
	public function violations(): array {
		return $this->violations;
	}

	/** @return array<int,array<string,string>> */
	public function toArray(): array {
		$out = array();
		foreach ( $this->violations as $v ) {
			$out[] = $v->toArray();
		}
		return $out;
	}
}
