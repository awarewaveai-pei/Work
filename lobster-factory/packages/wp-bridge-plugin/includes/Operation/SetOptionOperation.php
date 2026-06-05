<?php
/**
 * SetOptionOperation — the first concrete Operation: set a WordPress option, the self-healing way.
 *
 * Paired with OptionSnapshotter (captures/restores the option) so WriteTransaction can apply it,
 * render-verify the affected URLs, and auto-rollback if anything breaks.
 *
 * @package AwareWave\WpBridge\Operation
 */

namespace AwareWave\WpBridge\Operation;

use AwareWave\WpBridge\Transaction\Operation;

final class SetOptionOperation implements Operation {

	/** @var string */
	private $name;
	/** @var mixed */
	private $newValue;
	/** @var string[] */
	private $affectedUrls;

	/**
	 * @param mixed    $newValue
	 * @param string[] $affectedUrls URLs whose render proves the change (and must stay 2xx).
	 */
	public function __construct( string $name, $newValue, array $affectedUrls ) {
		$this->name         = $name;
		$this->newValue     = $newValue;
		$this->affectedUrls = $affectedUrls;
	}

	public function target(): string {
		return 'option:' . $this->name;
	}

	public function apply(): void {
		update_option( $this->name, $this->newValue );
	}

	public function affectedUrls(): array {
		return $this->affectedUrls;
	}

	public function isReversible(): bool {
		return true;
	}

	public function expectsChange(): bool {
		return true;
	}

	public function describe(): array {
		return array(
			'operation'    => 'set_option',
			'option'       => $this->name,
			'new_value'    => $this->newValue,
			'affectedUrls' => $this->affectedUrls,
		);
	}
}
