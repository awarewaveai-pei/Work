// An allowed collect.fetch grant for tests that drive the paid provider seam (ADR 017 §4).
import { can, type Grant } from "@/lib/entitlements/can";
import { CUSTOMER, gateFixture } from "@/lib/entitlements/__tests__/gate-fixtures";

export const collectGrant = (): Promise<Grant> => can(CUSTOMER, "collect.fetch", "system", gateFixture({ balance: 100 }).deps);
