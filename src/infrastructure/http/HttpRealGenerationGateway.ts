import type { RealGenerationGateway } from "../../application/generation/RealGenerationGateway";
import {
  GenerationConnectionSchema,
  GenerationProbeSchema,
  PlatformContainerPageSchema,
  PlatformLoginSchema,
  StartGenerationProbeSchema,
  type PlatformLogin,
  type StartGenerationProbe,
} from "../../contracts/real-generation";
import { HttpApiClient } from "./HttpApiClient";

const root = "/api/real-generation";

export class HttpRealGenerationGateway implements RealGenerationGateway {
  constructor(private readonly http: HttpApiClient) {}

  getConnection() {
    return this.http.read(`${root}/connection`, GenerationConnectionSchema);
  }

  connect(input: PlatformLogin) {
    return this.http.read(`${root}/connection`, GenerationConnectionSchema, {
      method: "POST",
      body: JSON.stringify(PlatformLoginSchema.parse(input)),
    });
  }

  disconnect(): Promise<void> {
    return this.http.sendWithoutResponse(`${root}/connection`, { method: "DELETE" });
  }

  listProjects(page = 1) {
    return this.http.read(`${root}/projects?page=${encodeURIComponent(page)}`, PlatformContainerPageSchema);
  }

  startProbe(input: StartGenerationProbe) {
    return this.http.read(`${root}/probes`, GenerationProbeSchema, {
      method: "POST",
      body: JSON.stringify(StartGenerationProbeSchema.parse(input)),
    });
  }

  getProbe(id: string) {
    return this.http.read(`${root}/probes/${encodeURIComponent(id)}`, GenerationProbeSchema);
  }

  retrySave(id: string) {
    return this.http.read(`${root}/probes/${encodeURIComponent(id)}/retry-save`, GenerationProbeSchema, { method: "POST" });
  }
}
