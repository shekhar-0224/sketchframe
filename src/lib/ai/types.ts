/**
 * Provider-agnostic AI contracts. Pipelines only ever talk to these interfaces,
 * so adding a provider means implementing one class and registering it in ./registry.
 */

export interface TextRequest {
  system: string;
  prompt: string;
  /** Ask the provider for strict JSON output. */
  json?: boolean;
  temperature?: number;
}

export interface TextProvider {
  readonly id: string;
  generateText(req: TextRequest): Promise<string>;
}

export interface LabeledImage {
  /** Human label sent alongside the image, e.g. "MAYA — front view". */
  label: string;
  data: Buffer;
  mimeType: "image/png" | "image/jpeg";
}

/**
 * Cost tiers. Sheets anchor every panel, so they get the best model; "cast" panels show
 * faces up close; "filler" panels (environments, wides, inserts) can use the cheapest.
 */
export type ImageTier = "sheet" | "cast" | "filler";

export interface ImageRequest {
  prompt: string;
  tier: ImageTier;
  /** Character sheets etc. Providers MUST forward every reference; consistency depends on it. */
  references: LabeledImage[];
  /** Optional rough sketch / edited panel whose composition must be followed. */
  layout?: LabeledImage;
  aspectRatio: "16:9" | "1:1" | "4:3" | "9:16" | "2.39:1";
  /** Hint for mock/offline rendering; real providers ignore it. */
  meta?: {
    kind: "panel" | "sheet";
    title?: string;
    subtitle?: string;
    names?: string[];
    shotSize?: string;
    /** Plain-language pieces for providers that can't take long instructions (the free tier). */
    angle?: string;
    action?: string;
    setting?: string;
    castLines?: string[];
    description?: string;
  };
}

export interface ImageProvider {
  readonly id: string;
  generateImage(req: ImageRequest): Promise<Buffer>;
  /** Model id used for a tier, recorded on each panel for transparency. */
  modelFor(tier: ImageTier): string;
}

export class ProviderError extends Error {
  constructor(provider: string, message: string, public status?: number) {
    super(`[${provider}] ${message}`);
  }
}
