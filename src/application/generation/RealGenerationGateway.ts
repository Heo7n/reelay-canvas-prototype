import type {
  GenerationConnection,
  GenerationProbe,
  PlatformContainerPage,
  PlatformLogin,
  StartGenerationProbe,
} from "../../domain/generation/real-generation";

export interface RealGenerationGateway {
  getConnection(): Promise<GenerationConnection>;
  connect(input: PlatformLogin): Promise<GenerationConnection>;
  disconnect(): Promise<void>;
  listProjects(page?: number): Promise<PlatformContainerPage>;
  startProbe(input: StartGenerationProbe): Promise<GenerationProbe>;
  getProbe(id: string): Promise<GenerationProbe>;
  retrySave(id: string): Promise<GenerationProbe>;
}
