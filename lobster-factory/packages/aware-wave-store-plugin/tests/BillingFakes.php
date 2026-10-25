<?php
/**
 * In-memory Shop / Members / Queue / HttpClient for the billing tests (no WordPress).
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\HttpClient;
use AwareWave\Store\Members;
use AwareWave\Store\Queue;
use AwareWave\Store\Shop;

final class FakeShop implements Shop {
	/** @var array<int,array> */
	public $orders = array();
	/** @var array<int,array> */
	public $subscriptions = array();
	/** @var array<int,array<string,list<int>>> order id => type => subscription ids */
	public $relations = array();
	/** @var array<int,array> */
	public $products = array();
	/** @var list<array{0:int,1:string}> */
	public $notes = array();
	/** @var array<int,bool> */
	public $granted = array();

	public function markGranted( int $orderId ): void {
		$this->granted[ $orderId ] = true;
	}

	public function wasGranted( int $orderId ): bool {
		return ! empty( $this->granted[ $orderId ] );
	}

	public function order( int $orderId ): ?array {
		return $this->orders[ $orderId ] ?? null;
	}

	public function subscriptionIdsForOrder( int $orderId, array $types ): array {
		$ids = array();
		foreach ( $types as $t ) {
			foreach ( $this->relations[ $orderId ][ $t ] ?? array() as $id ) {
				$ids[] = $id;
			}
		}
		return $ids;
	}

	public function subscription( int $subscriptionId ): ?array {
		return $this->subscriptions[ $subscriptionId ] ?? null;
	}

	public function productMeta( int $productId ): array {
		return ( $this->products[ $productId ] ?? array() ) + array( 'plan_key' => '', 'credit_units' => 0, 'product_key' => '' );
	}

	public function addNote( int $orderOrSubscriptionId, string $note ): void {
		$this->notes[] = array( $orderOrSubscriptionId, $note );
	}
}

final class FakeMembers implements Members {
	/** @var array<int,array> */
	public $members = array();

	public function member( int $userId ): ?array {
		return $this->members[ $userId ] ?? null;
	}
}

final class FakeQueue implements Queue {
	/** @var list<array> */
	public $jobs = array();
	/** @var list<array{0:int,1:array}> */
	public $scheduled = array();

	public function enqueue( array $job ): void {
		$this->jobs[] = $job;
	}

	public function scheduleAt( int $timestamp, array $job ): void {
		$this->scheduled[] = array( $timestamp, $job );
	}
}

final class FakeHttp implements HttpClient {
	/** @var int|null */
	public $status;
	/** @var string */
	public $body;
	/** @var list<array{url:string,headers:array,body:string}> */
	public $requests = array();

	public function __construct( ?int $status, string $body = '' ) {
		$this->status = $status;
		$this->body   = $body;
	}

	public function post( string $url, array $headers, string $body ): array {
		$this->requests[] = array( 'url' => $url, 'headers' => $headers, 'body' => $body );
		return array( 'status' => $this->status, 'body' => $this->body, 'error' => $this->status === null ? 'timeout' : '' );
	}
}
