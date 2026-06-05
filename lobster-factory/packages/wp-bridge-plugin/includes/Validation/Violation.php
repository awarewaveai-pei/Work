<?php
/**
 * Violation — one thing wrong with a proposed write, located precisely so the caller can point the
 * AI/operator at exactly which block to fix.
 *
 * @package AwareWave\WpBridge\Validation
 */

namespace AwareWave\WpBridge\Validation;

final class Violation {

	/** @var string dotted path to the offending node, e.g. "0.innerBlocks.1". */
	private $path;
	/** @var string machine code, e.g. 'missing_kb_version'. */
	private $code;
	/** @var string human/AI-readable fix hint. */
	private $hint;

	public function __construct( string $path, string $code, string $hint ) {
		$this->path = $path;
		$this->code = $code;
		$this->hint = $hint;
	}

	public function path(): string {
		return $this->path;
	}

	public function code(): string {
		return $this->code;
	}

	public function hint(): string {
		return $this->hint;
	}

	/** @return array<string,string> */
	public function toArray(): array {
		return array( 'path' => $this->path, 'code' => $this->code, 'hint' => $this->hint );
	}
}
