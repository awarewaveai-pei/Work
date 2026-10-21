// The article rewrite on social's own door (/api/content/syndicate is not served there, doors.test.ts), billed as social.rewrite.
import { withFeature } from "@/lib/entitlements/grant";
import { syndicateHandler } from "@/lib/content/syndicate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withFeature("social.rewrite", syndicateHandler("/api/social/rewrite"));
