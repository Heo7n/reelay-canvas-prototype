import type { PlatformLogin } from "../../domain/generation/real-generation";
import type { SeedanceVideoParameters } from "../../domain/generation/seedance-video";

export type RealGenerationErrorCode = "unavailable" | "disconnected" | "expired" | "credentials_rejected" | "agent_channel_rejected" | "platform_unavailable" | "protocol_unconfirmed" | "container_unavailable" | "probe_busy" | "probe_not_found" | "request_conflict" | "save_unavailable" | "account_mismatch";

export class RealGenerationError extends Error {
  constructor(readonly code: RealGenerationErrorCode) {
    super(code);
    this.name = "RealGenerationError";
  }
}

export interface PlatformIdentity {
  token: string;
  userId: string;
  displayName: string;
}

export interface PlatformContainer {
  id: string;
  name: string;
  projectId?: string;
}

export interface PlatformPage {
  items: PlatformContainer[];
  hasMore: boolean;
}

export interface PlatformVideo {
  assetId: string;
  artifactId?: string;
  url: string;
}

export type PlatformGenerationOutcome =
  | { status: "succeeded"; video: PlatformVideo }
  | { status: "failed" }
  | { status: "unconfirmed" };

export interface PlatformGenerationInput {
  token: string;
  projectId: string;
  prompt: string;
  signal: AbortSignal;
  onEvent: (type: string, shape?: string) => void;
  parameters?: SeedanceVideoParameters;
  onArtifact?: (artifact: { assetId: string; artifactId: string }) => Promise<void>;
}

export interface RealGenerationPlatform {
  dispose(): void;
  login(input: PlatformLogin): Promise<PlatformIdentity>;
  listProjects(token: string, page: number): Promise<PlatformPage>;
  listAgentProjects(token: string, page: number): Promise<PlatformPage>;
  generate(input: PlatformGenerationInput): Promise<PlatformGenerationOutcome>;
  download(token: string, video: PlatformVideo, signal: AbortSignal): Promise<{ contentType: string; body: Uint8Array }>;
}
