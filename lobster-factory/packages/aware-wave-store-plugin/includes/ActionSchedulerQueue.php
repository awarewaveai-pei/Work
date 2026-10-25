<?php
/**
 * Queue over Action Scheduler (bundled with WooCommerce). The job array is the action's single argument.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class ActionSchedulerQueue implements Queue {

	/** @var Shop */
	private $shop;

	public function __construct( Shop $shop ) {
		$this->shop = $shop;
	}

	public function enqueue( array $job ): void {
		if ( ! function_exists( 'as_enqueue_async_action' ) ) {
			$this->missing( $job );
			return;
		}
		as_enqueue_async_action( PaymentSender::ACTION, array( $job ), PaymentSender::GROUP );
	}

	public function scheduleAt( int $timestamp, array $job ): void {
		if ( ! function_exists( 'as_schedule_single_action' ) ) {
			$this->missing( $job );
			return;
		}
		as_schedule_single_action( $timestamp, PaymentSender::ACTION, array( $job ), PaymentSender::GROUP );
	}

	private function missing( array $job ): void {
		$this->shop->addNote( (int) $job['note_id'], 'AwareWave：Action Scheduler 不可用，付款事件 ' . $job['event_id'] . ' 未排程；請人工登記。' );
	}
}
