import type { WpPluginModule } from "../wp-plugin-stack-catalog";

// ── Intake Form ─────────────────────────────────────────────────────────────

export type Industry = "ecommerce" | "service" | "tourism" | "arts" | "education" | "other";
export type PrimaryGoal = "brand" | "sell" | "booking" | "blog" | "card_site";
export type PageType = "home" | "about" | "products" | "blog" | "contact" | "cart" | "booking";
export type VisualStyle = "minimal" | "warm" | "professional" | "playful" | "luxury";
export type ProductType = "physical" | "digital" | "pod" | "booking_service";
export type BudgetTier = "starter" | "business" | "enterprise";
export type LaunchUrgency = "within_month" | "one_to_three_months" | "no_rush";
export type ContentStatus = "yes" | "partial" | "no";
export type LogoStatus = "has_logo" | "need_placeholder" | "will_provide";

export interface IntakeForm {
  // Required
  company_name: string;
  industry: Industry;
  pages_needed: PageType[];
  has_ecommerce: boolean;
  budget_tier: BudgetTier;

  // Deprecated (2026-06-05): the abstract "建站主要目的" question was removed from the intake
  // as redundant with industry + pages_needed + needs_ecommerce/booking/crm. Kept optional for
  // backward-compat with already-stored intake_forms; no longer collected or required.
  primary_goal?: PrimaryGoal[];

  // Optional
  brand_tagline?: string;
  target_audience?: string;
  reference_sites?: string[];       // max 3 URLs
  visual_style?: VisualStyle[];
  primary_color?: string;           // hex (#RRGGBB) or plain description
  secondary_color?: string;         // optional brand accent; blank → Claude derives a harmonious one
  logo_status?: LogoStatus;
  product_type?: ProductType[];     // required when has_ecommerce = true
  needs_crm?: boolean;
  needs_booking?: boolean;
  contact_email?: string;
  domain?: string;                  // existing domain; leave empty for staging-only
  language?: string;                // "zh-TW" | "en" | BCP-47
  existing_content?: ContentStatus;
  launch_urgency?: LaunchUrgency;
}

// ── Website Spec (Claude-generated output) ──────────────────────────────────

export type PackageSlug = "wp-basic" | "wp-business" | "wc-core" | "wc-custom";

export interface SitemapPage {
  slug: string;
  title: string;
  template: string;         // e.g. "home", "about", "shop", "contact"
  is_homepage?: boolean;
  child_pages?: SitemapPage[];
}

export interface HomepageHero {
  headline: string;
  subheadline: string;
  cta_text: string;
  cta_url: string;
}

export interface HomepageSection {
  type: "features" | "about_preview" | "testimonials" | "products" | "cta_banner" | "contact_form";
  headline?: string;
  body?: string;
}

export interface DesignDirection {
  style_direction: string;    // 1-2 sentences, Kadence palette reference
  primary_color: string;      // hex
  secondary_color: string;    // hex
  font_suggestion: string;    // e.g. "Inter + Playfair Display"
  image_style: string;        // e.g. "溫暖真實人物攝影，自然光"
}

export interface ImageRequirement {
  page: string;
  section: string;
  description: string;
  suggested_size: string;     // e.g. "1920×1080"
  quantity: number;
}

// Per-plugin configuration blocks (minimal; expand per plugin as needed)
export interface KadenceConfig {
  global_color_palette: string[];
  logo_url?: string;
  header_layout?: string;
}

export interface WooConfig {
  currency: string;
  shop_page_title?: string;
  checkout_page_title?: string;
}

export interface FluentCRMConfig {
  double_optin: boolean;
  default_list_name?: string;
}

export interface FluentFormsConfig {
  contact_form_recipients: string[];
}

export interface RankMathConfig {
  site_title: string;
  meta_description: string;
  focus_keywords: string[];
  schema_type: "LocalBusiness" | "Store" | "Organization" | "Person" | "WebSite";
}

export interface FluentSMTPConfig {
  from_email: string;
  from_name: string;
  mailer?: "sendgrid" | "smtp" | "gmail";
}

export interface WebsiteSpec {
  // Identity
  site_name: string;
  tagline: string;
  language: string;

  // Build config
  package_slug: PackageSlug;
  packs: WpPluginModule[];

  // Architecture
  sitemap: SitemapPage[];

  // Homepage
  homepage: {
    hero: HomepageHero;
    sections: HomepageSection[];
  };

  // Design
  design: DesignDirection;

  // Assets
  image_requirements: ImageRequirement[];

  // Plugin config
  plugin_config: {
    kadence: KadenceConfig;
    rankmath: RankMathConfig;
    fluentsmtp: FluentSMTPConfig;
    woocommerce?: WooConfig;
    fluentcrm?: FluentCRMConfig;
    fluentforms?: FluentFormsConfig;
  };

  // SEO summary (mirrors rankmath config for quick access)
  seo: {
    meta_title: string;
    meta_description: string;
    focus_keywords: string[];
    schema_type: RankMathConfig["schema_type"];
  };

  // Metadata
  generated_at: string;       // ISO UTC
  generated_by: string;       // e.g. "claude-sonnet-4-6"
  intake_form_id?: string;    // DB reference
}
