<?php
/**
 * WooCommerce → AwareWave 付款與會員 (ADR 017 4b-2): the one switch (default off), the next-admin base URL, the two
 * secrets (password fields; a stored secret is never printed back, blank = keep), and "resend verification".
 *
 * @package AwareWave\Store\Admin
 */

namespace AwareWave\Store\Admin;

use AwareWave\Store\EmailVerification;
use AwareWave\Store\Settings;

final class SettingsPage {

	// Same page slug as wp-bridge <= 0.18.3, so an old bookmark still opens it.
	const SLUG = 'aware-wave-billing';
	const CAP  = 'manage_options';

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ), 20 );
	}

	public function menu(): void {
		add_submenu_page( 'woocommerce', 'AwareWave 付款與會員', 'AwareWave 付款與會員', self::CAP, self::SLUG, array( $this, 'render' ) );
	}

	public function render(): void {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Insufficient permissions.' );
		}
		$notices = $this->handle();
		$s       = Settings::fromOptions();

		echo '<div class="wrap"><h1>AwareWave 付款與會員</h1>';
		foreach ( $notices as $n ) {
			echo '<div class="notice notice-' . esc_attr( $n[0] ) . '"><p>' . esc_html( $n[1] ) . '</p></div>';
		}
		echo '<p>開關打開後：付款完成、續約、換方案、全額退款、取消／到期會送到 app.aware-wave.com；未確認信箱的會員不能結帳 AwareWave 商品；「我的帳號」出現產品「進入」按鈕；商品編輯頁出現 AwareWave 方案／點數／產品欄位。關掉＝全部停止（已排隊未送的事件會在訂單備註標示未送出）。</p>';
		echo '<form method="post">';
		wp_nonce_field( 'awbridge_billing_save' );
		echo '<input type="hidden" name="awbridge_billing" value="save"><table class="form-table">';
		echo '<tr><th>啟用</th><td><label><input type="checkbox" name="enabled" value="1"' . checked( $s->enabled, true, false ) . '> 送付款事件、結帳前驗證信箱、進入按鈕</label></td></tr>';
		echo '<tr><th>控制面網址</th><td><input name="target" class="regular-text" value="' . esc_attr( $s->target ) . '"><p class="description">預設 ' . esc_html( Settings::DEFAULT_TARGET ) . '；只接受 https。</p></td></tr>';
		$this->secretRow( 'payments_secret', '付款事件密鑰', $s->paymentsSecret, 'next-admin 的 PAYMENTS_WOO_SECRET，同一值。' );
		$this->gatewayRow( $s->allowedGateways );
		$this->secretRow( 'handoff_secret', '進入按鈕密鑰', $s->handoffSecret, 'next-admin 的 AUTH_WP_HANDOFF_SECRET，同一值；不要與付款密鑰相同。' );
		echo '</table>';
		submit_button( '儲存' );
		echo '</form>';

		echo '<h2>重寄信箱確認信</h2><form method="post">';
		wp_nonce_field( 'awbridge_billing_resend' );
		echo '<input type="hidden" name="awbridge_billing" value="resend">';
		echo '<input name="member" class="regular-text" placeholder="會員 email 或 ID"> ';
		submit_button( '重寄', 'secondary', 'submit', false );
		echo '</form></div>';
	}

	/** @param list<string> $allowed */
	private function gatewayRow( array $allowed ): void {
		echo '<tr><th>自動開通的付款方式</th><td>';
		$gateways = function_exists( 'WC' ) && WC()->payment_gateways() ? WC()->payment_gateways()->payment_gateways() : array();
		if ( ! $gateways ) {
			echo '<p>WooCommerce 尚未啟用或沒有付款方式。</p>';
		}
		foreach ( $gateways as $id => $gw ) {
			echo '<label style="display:block"><input type="checkbox" name="gateways[]" value="' . esc_attr( $id ) . '"' . checked( in_array( $id, $allowed, true ), true, false ) . '> '
				. esc_html( wp_strip_all_tags( (string) $gw->get_title() ) ) . ' <code>' . esc_html( $id ) . '</code></label>';
		}
		echo '<p class="description">只勾「付款完成才把訂單變成處理中」的線上付款（例如 TapPay 刷卡）。<b>不要勾</b>貨到付款、超商取貨付款、銀行轉帳、支票：它們在收到錢之前訂單就會是處理中。購物車有 AwareWave 商品時，結帳頁只顯示勾選的方式；一個都不勾＝AwareWave 商品無法結帳。</p></td></tr>';
	}

	private function secretRow( string $name, string $label, string $current, string $help ): void {
		$state = $current === '' ? '未設定' : ( Settings::secretUsable( $current ) ? '已設定' : '已設定但格式不符（須 32 字以上、不含空白）' );
		echo '<tr><th>' . esc_html( $label ) . '</th><td><input type="password" name="' . esc_attr( $name ) . '" class="regular-text" autocomplete="new-password" value=""> ';
		echo '<label><input type="checkbox" name="' . esc_attr( $name ) . '_clear" value="1"> 清除</label>';
		echo '<p class="description">目前：' . esc_html( $state ) . '。留空＝不變。' . esc_html( $help ) . '</p></td></tr>';
	}

	/** @return list<array{0:string,1:string}> */
	private function handle(): array {
		$action = isset( $_POST['awbridge_billing'] ) ? sanitize_key( wp_unslash( $_POST['awbridge_billing'] ) ) : '';
		if ( $action === 'save' ) {
			check_admin_referer( 'awbridge_billing_save' );
			return $this->save();
		}
		if ( $action === 'resend' ) {
			check_admin_referer( 'awbridge_billing_resend' );
			return array( $this->resend() );
		}
		return array();
	}

	/** @return list<array{0:string,1:string}> */
	private function save(): array {
		$out    = array();
		$target = Settings::normalizeTarget( esc_url_raw( wp_unslash( $_POST['target'] ?? '' ) ) );
		if ( $target === null ) {
			$out[] = array( 'error', '控制面網址須為 https 網址，未變更。' );
		} else {
			update_option( Settings::OPT_TARGET, $target, false );
		}
		$secrets = array(
			'payments_secret' => Settings::OPT_PAYMENTS_SECRET,
			'handoff_secret'  => Settings::OPT_HANDOFF_SECRET,
		);
		foreach ( $secrets as $field => $option ) {
			// Raw value on purpose: sanitize_text_field would alter a secret; secretUsable() allows printable ASCII only.
			$value = isset( $_POST[ $field ] ) ? (string) wp_unslash( $_POST[ $field ] ) : '';
			if ( ! empty( $_POST[ $field . '_clear' ] ) ) {
				delete_option( $option );
			} elseif ( $value !== '' ) {
				if ( Settings::secretUsable( $value ) ) {
					update_option( $option, $value, false );
				} else {
					$out[] = array( 'error', '密鑰須 32 字以上、只含可見英數符號，未變更。' );
				}
			}
		}
		$p = (string) get_option( Settings::OPT_PAYMENTS_SECRET, '' );
		if ( $p !== '' && $p === (string) get_option( Settings::OPT_HANDOFF_SECRET, '' ) ) {
			delete_option( Settings::OPT_HANDOFF_SECRET );
			$out[] = array( 'error', '進入按鈕密鑰不可與付款密鑰相同，已清除進入按鈕密鑰。' );
		}
		$installed = function_exists( 'WC' ) && WC()->payment_gateways() ? array_keys( WC()->payment_gateways()->payment_gateways() ) : array();
		$picked    = isset( $_POST['gateways'] ) && is_array( $_POST['gateways'] ) ? array_map( 'sanitize_key', wp_unslash( $_POST['gateways'] ) ) : array();
		update_option( Settings::OPT_GATEWAYS, array_values( array_intersect( $installed, $picked ) ), true );
		update_option( Settings::OPT_ENABLED, empty( $_POST['enabled'] ) ? '' : '1', true );
		$out[] = array( 'success', '已儲存。' );
		return $out;
	}

	/** @return array{0:string,1:string} */
	private function resend(): array {
		$who  = sanitize_text_field( wp_unslash( $_POST['member'] ?? '' ) );
		$user = ctype_digit( $who ) ? get_userdata( (int) $who ) : get_user_by( 'email', $who );
		if ( ! $user ) {
			return array( 'error', '找不到這位會員。' );
		}
		return EmailVerification::send( (int) $user->ID )
			? array( 'success', '已寄出確認信給會員 #' . $user->ID . '。' )
			: array( 'error', '寄送失敗（請檢查網站寄信設定）。' );
	}
}
