/**
 * Side-effect loader for the backend block registry.
 *
 * Import this once before reading `listAll()` / `byKind()` when the caller wants the complete
 * registered block manifest. Each imported file registers itself into `registry.ts`.
 */
import "./article-generate";
import "./seo-check";
import "./publish-wordpress";
import "./product-copy";
import "./image-style-design-workbench";
import "./ai-image-edit-prompt";
import "./video-pipeline";
import "./video-prepare";
import "./video-render";
