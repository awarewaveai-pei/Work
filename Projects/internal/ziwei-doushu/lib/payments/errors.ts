import type { Region } from './types';

export class PaymentNotConfiguredError extends Error {
  constructor(public readonly providerId: string) {
    super(`金流 provider 未設定金鑰: ${providerId}`);
    this.name = 'PaymentNotConfiguredError';
  }
}

export class PaymentNotImplementedError extends Error {
  constructor(public readonly providerId: string) {
    super(`金流 provider 尚未實作(待接 SDK): ${providerId}`);
    this.name = 'PaymentNotImplementedError';
  }
}

export class NoGatewayForRegionError extends Error {
  constructor(public readonly region: Region) {
    super(`無可用金流 gateway 服務此地區: ${region}`);
    this.name = 'NoGatewayForRegionError';
  }
}
