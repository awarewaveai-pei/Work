/** Same JSON shape as next-admin lib/content/video/asset-origin.ts:9-12 `AssetOrigin` (not imported; P6 writes it
 *  to media_assets.metadata.rightsSources), plus the workbench's own kinds: `render` = output of a local edit or
 *  tool job, `import` = arrived without a record (`legacy` = saved before origins existed). */
export type AssetOrigin = (
  | { kind: "ai_generated"; model: string; provider: string }
  | { kind: "pexels"; sourceRef: string }
  | { kind: "upload"; rightsConfirmed: boolean }
  | { kind: "render"; jobId: string; parentAssetId?: string }
  | { kind: "import"; legacy?: boolean }
) & { prompt?: string; costUsd?: number };
export interface Asset {
  id: string;
  kind: "image" | "video" | "audio" | "character" | "scene" | "prop";
  name: string;
  url: string;
  references: string[];
  origin: AssetOrigin;
}
export interface GenerationPreset {
  id: string;
  mode: "director" | "reference" | "reshoot" | "cartoon" | "product" | "spoken" | "image";
  name: string;
  default: boolean;
  model: string;
  settings: {
    ratio: string;
    ratios: string[];
    quality: string;
    duration: number;
    audio: string;
    watermark: string;
    subtitle: string;
    subtitleOptions?: { languages: string[]; style: string; size: string; position: string };
    skill: string;
    skills?: string[];
    style: number;
  };
}
export interface Character {
  id: string;
  name: string;
  description: string;
  image?: string;
  references: string[];
  wardrobe: string[];
  accessories: string[];
  favorite: boolean;
  inLibrary: boolean;
  voice: Asset | null;
}
export interface Project {
  id: string;
  title: string;
  type: "series" | "single";
  ratio: string;
  assets: Asset[];
  episodes: Episode[];
}
export interface Episode {
  id: string;
  name: string;
  outline: string;
  shots: unknown[];
}
export interface GenerationJob {
  id: string;
  type: string;
  status:
    | "submitting"
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "blocked"
    | "cancelled";
  progress: number;
  input: Record<string, unknown>;
  createdAt: string;
  result?: { url: string; sourceUrl?: string; width?: number; height?: number; layout?: "center-crop"; origin?: AssetOrigin };
  /** Same key on a resend = the server returns the first job instead of calling the provider again. */
  idempotencyKey?: string;
  /** Set by POST /generations/:id/retry (failed or cancelled jobs only); the new job has its own id. */
  retryOf?: string;
  error?: string;
  serverAccepted?: boolean;
  /** POST /generations answered 400/401/403/404/405/409/413/415/422/429/501/503. A host must use these
   *  only when the request never reached a paid provider; once it may have, answer 2xx, 502 or 504. */
  submissionRejected?: boolean;
  submissionUnconfirmed?: boolean;
}
export interface State {
  version: 1;
  /** Server-assigned; PUT /state must send the revision it read, else 409 with the current state. */
  revision: number;
  characters: Character[];
  projects: Project[];
  assets: Asset[];
  jobs: GenerationJob[];
  preferences: Record<string, unknown>;
  selection: { current?: string; episode?: number };
}
