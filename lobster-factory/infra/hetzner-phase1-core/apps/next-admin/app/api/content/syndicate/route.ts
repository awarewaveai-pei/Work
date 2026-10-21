import { withFeature } from "@/lib/entitlements/grant";
import { syndicateHandler } from "@/lib/content/syndicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withFeature("content.syndicate", syndicateHandler("/api/content/syndicate"));
