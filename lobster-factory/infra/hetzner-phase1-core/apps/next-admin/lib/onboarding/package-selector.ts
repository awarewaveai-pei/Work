import type { WpPluginModule } from "../wp-plugin-stack-catalog";
import type { IntakeForm, PackageSlug } from "./intake-form";

export interface PackageSelection {
  package_slug: PackageSlug;
  packs: WpPluginModule[];
  rationale: string;
}

/**
 * Derives the WP package and plugin packs from an intake form.
 * Rules evaluated top-to-bottom; first match wins.
 */
export function selectPackage(form: IntakeForm): PackageSelection {
  // POD / custom product ecommerce
  if (form.has_ecommerce && form.product_type?.includes("pod")) {
    return {
      package_slug: "wc-custom",
      packs: ["base", "ecommerce"],
      rationale: "客製商品 / Print-On-Demand 電商",
    };
  }

  // Standard ecommerce
  if (form.has_ecommerce) {
    return {
      package_slug: "wc-core",
      packs: ["base", "ecommerce"],
      rationale: "標準 WooCommerce 電商",
    };
  }

  // Tourism / booking — derived from concrete needs (the abstract "primary_goal" field was
  // removed from the intake as redundant with industry + needs_booking + pages_needed).
  if (form.industry === "tourism" || form.needs_booking || (form.pages_needed?.includes("booking") ?? false)) {
    return {
      package_slug: "wp-business",
      packs: ["base", "tourism"],
      rationale: "觀光旅遊 / 預約服務",
    };
  }

  // Business with CRM or higher budget
  if (
    form.needs_crm ||
    form.budget_tier === "business" ||
    form.budget_tier === "enterprise"
  ) {
    return {
      package_slug: "wp-business",
      packs: ["base", "brand"],
      rationale: "品牌展示 + CRM",
    };
  }

  // Starter brand / card site
  return {
    package_slug: "wp-basic",
    packs: ["base"],
    rationale: "品牌展示名片站",
  };
}
