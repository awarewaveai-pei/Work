<?php
/**
 * Sign-up gift (operator 2026-10-30: 「如果註冊會員就送點數50點」; decision agency-os/reports/decisions/
 * 2026-10-30-customer-self-signup-email-google.md): the moment a member's email is verified, one zero-price order for
 * the gift product (Settings → 註冊禮商品) is made and completed. Everything after is the ordinary paid-order path:
 * PaymentEvents sends the credit pack (units and add-on plan from the product's AwareWave fields), next-admin makes the
 * account on that first payment, and the order puts the product's 「進入」 button on My Account. No second channel.
 *
 * Once per MAILBOX, not per member (critic 2026-10-30 M1/M2): the claim is a wp_options row named after the
 * normalized address (mailboxKey: case, +tag, Gmail dots and googlemail), inserted with INSERT IGNORE on the table's
 * unique option_name -- the database decides, so aliases and racing verification clicks get one gift between them.
 * Only verified members get it. The order is accepted as paid only when its method is METHOD and its total is 0
 * (isGiftOrder; no checkout can pick METHOD, it is not a registered gateway), and the product must be private, which
 * WooCommerce never lets a customer buy (giftable): a gift product in a paid cart adds nothing either way
 * (PaymentEvents counts only paid lines).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class WelcomeGift {

	const METHOD      = 'awarewave_welcome';
	const META_ORDER  = 'aware_wave_welcome_order';
	const CLAIM       = 'aware_wave_welcome_'; // + mailboxKey()
	const VERIFIED    = 'aware_wave_member_verified'; // action fired by EmailVerification and GoogleSignup

	/** An order this class made: the gift method at no charge. @param array{payment_method:string,total:float} $order */
	public static function isGiftOrder( array $order ): bool {
		return $order['payment_method'] === self::METHOD && abs( (float) $order['total'] ) < 0.000001;
	}

	/**
	 * Whether a product may be given away: free, private (no customer can put it in a cart) and an AwareWave credit
	 * pack (credit_units > 0). A priced or buyable product is never given, whatever the setting says.
	 *
	 * @param array{plan_key:string,credit_units:int,product_key:string} $meta
	 */
	public static function giftable( array $meta, float $price, string $status ): bool {
		return $meta['credit_units'] > 0 && abs( $price ) < 0.000001 && $status === 'private';
	}

	/** One mailbox, one key: lower case, no +tag; Gmail ignores dots and googlemail.com is gmail.com. '' = not an address. */
	public static function mailboxKey( string $email ): string {
		$e  = EmailVerification::normalizeEmail( $email );
		$at = strrpos( $e, '@' );
		if ( $at === false || $at === 0 || $at === strlen( $e ) - 1 ) {
			return '';
		}
		$local  = substr( $e, 0, $at );
		$domain = substr( $e, $at + 1 );
		$plus   = strpos( $local, '+' );
		if ( $plus !== false ) {
			$local = substr( $local, 0, $plus );
		}
		if ( $domain === 'googlemail.com' ) {
			$domain = 'gmail.com';
		}
		if ( $domain === 'gmail.com' ) {
			$local = str_replace( '.', '', $local );
		}
		return $local === '' ? '' : hash( 'sha256', $local . '@' . $domain );
	}

	// ---- WordPress wiring ----

	/** @var int */
	private $productId;
	/** @var Shop */
	private $shop;

	public function __construct( int $productId, Shop $shop ) {
		$this->productId = $productId;
		$this->shop      = $shop;
	}

	public function register(): void {
		if ( $this->productId > 0 ) {
			add_action( self::VERIFIED, array( $this, 'grant' ) );
		}
	}

	public function grant( $userId ): void {
		global $wpdb;
		$uid  = (int) $userId;
		$user = $uid > 0 ? get_userdata( $uid ) : false;
		if ( ! $user || ! EmailVerification::isUserVerified( $uid ) || get_user_meta( $uid, self::META_ORDER, true ) !== '' ) {
			return;
		}
		$key     = self::mailboxKey( (string) $user->user_email );
		$product = function_exists( 'wc_get_product' ) ? wc_get_product( $this->productId ) : null;
		if ( $key === '' || ! $product || ! self::giftable( $this->shop->productMeta( $this->productId ), (float) $product->get_price(), (string) $product->get_status() ) ) {
			return;
		}
		// The claim: exactly one INSERT wins per mailbox (unique option_name); everyone else stops here.
		$claim = self::CLAIM . substr( $key, 0, 40 );
		$won   = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $claim, (string) $uid ) );
		if ( $won !== 1 ) {
			return;
		}
		try {
			$order = wc_create_order( array( 'customer_id' => $uid, 'created_via' => self::METHOD ) );
			if ( is_wp_error( $order ) ) {
				throw new \RuntimeException( $order->get_error_message() );
			}
			$order->add_product( $product, 1 );
			$order->set_payment_method( self::METHOD );
			$order->set_payment_method_title( '註冊禮' );
			$order->calculate_totals( false );
			$order->save();
		} catch ( \Throwable $e ) {
			// Nothing was given: free the claim so the next verification of this mailbox can try again.
			$wpdb->delete( $wpdb->options, array( 'option_name' => $claim ) );
			error_log( '[aware-wave-store] welcome gift for user ' . $uid . ' failed: ' . $e->getMessage() );
			return;
		}
		update_user_meta( $uid, self::META_ORDER, (string) $order->get_id() );
		// payment_complete fires woocommerce_payment_complete -> PaymentEvents, the same as any paid order.
		$order->payment_complete();
	}
}
