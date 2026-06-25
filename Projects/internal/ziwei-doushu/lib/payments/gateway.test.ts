import { describe, it, expect } from 'vitest';
import { selectGateway, getGateway, listGateways } from './gateway';

describe('金流 gateway 地區路由', () => {
  it('列出三家 provider', () => {
    expect(listGateways().map((g) => g.id).sort()).toEqual([
      'ecpay',
      'paypal',
      'stripe',
    ]);
  });

  it('TW 地區 → 選到服務台灣的 gateway', () => {
    const g = selectGateway('TW');
    expect(g.regions).toContain('TW');
  });

  it('INTL 地區 → 選到服務國際的 gateway', () => {
    const g = selectGateway('INTL');
    expect(g.regions).toContain('INTL');
  });

  it('preferred 服務該地區時優先採用', () => {
    // Stripe 服務 TW + INTL,指定 stripe 應回 stripe
    expect(selectGateway('TW', 'stripe').id).toBe('stripe');
  });

  it('preferred 不服務該地區時退回地區預設', () => {
    // ecpay 只服務 TW;INTL 指定 ecpay 應退回服務國際者(非 ecpay)
    const g = selectGateway('INTL', 'ecpay');
    expect(g.id).not.toBe('ecpay');
    expect(g.regions).toContain('INTL');
  });

  it('ecpay 僅服務 TW、paypal 僅服務 INTL', () => {
    expect(getGateway('ecpay').regions).toEqual(['TW']);
    expect(getGateway('paypal').regions).toEqual(['INTL']);
  });
});
