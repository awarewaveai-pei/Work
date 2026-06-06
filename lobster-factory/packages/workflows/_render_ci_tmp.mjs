import { renderDay1CloudInit } from './src/hosting/providers/hetzner/cloudInit.ts';
const { userData } = renderDay1CloudInit({ sshPublicKey: 'ssh-ed25519 AAAATESTKEY test@x', hostname: 'lf-stg-sin-acme' });
process.stdout.write(userData);
