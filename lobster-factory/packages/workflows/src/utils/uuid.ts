import { randomUUID } from "node:crypto";

export function newUuid() {
  return randomUUID();
}

