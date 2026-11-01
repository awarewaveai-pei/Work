export interface Asset {
  id: string;
  kind: "image" | "video" | "audio" | "character" | "scene" | "prop";
  name: string;
  url: string;
  references: string[];
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
  result?: { url: string; sourceUrl?: string; width?: number; height?: number; layout?: "center-crop" };
  error?: string;
  serverAccepted?: boolean;
  submissionRejected?: boolean;
  submissionUnconfirmed?: boolean;
}
export interface State {
  version: 1;
  characters: Character[];
  projects: Project[];
  assets: Asset[];
  jobs: GenerationJob[];
  preferences: Record<string, unknown>;
  selection: { current?: string; episode?: number };
}
