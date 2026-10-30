import { baseDomain, doorForHost } from "./doors";

export type LoginDoor = { product: string; memberHref: string } | null;

/** The login a product door shows (ADR 018): its product name and the aware-wave.com way in; any other host gets null. */
export function loginDoor(host: string, env: Record<string, string | undefined> = process.env): LoginDoor {
  const door = doorForHost(host, env);
  return door.kind === "product" ? { product: door.product.name, memberHref: `https://${baseDomain(env)}/my-account/` } : null;
}
