export interface ProbeSpecification {
  modelId: string;
  model: string;
  modelName: string;
  resolution: "480P";
  aspectRatio: "16:9";
  duration: 5;
  generateAudio: true;
}

export interface PlatformLogin {
  type: "phone" | "email";
  target: string;
  password: string;
}

export interface StartGenerationProbe {
  requestKey: string;
  projectId: string;
  prompt: string;
  paidConsent: true;
}

export interface GenerationProbe {
  id: string;
  requestKey: string;
  status: "submitting" | "waiting" | "saving" | "succeeded" | "failed" | "unconfirmed" | "save_failed";
  createdAt: string;
  finishedAt: string | null;
  message: string;
  prompt: string;
  projectId: string;
  diagnostics: { eventCount: number; eventTypes: string[]; eventShapes: string[] };
  result: { url: string; contentType: string; byteSize: number } | null;
}

export interface GenerationConnection {
  channel: "web";
  available: boolean;
  state: "disconnected" | "connected" | "expired";
  reason: string | null;
  platformUser: { id: string; displayName: string } | null;
  specification: ProbeSpecification;
  probe: GenerationProbe | null;
}

export interface PlatformContainerPage {
  items: { id: string; name: string }[];
  page: number;
  hasMore: boolean;
}
