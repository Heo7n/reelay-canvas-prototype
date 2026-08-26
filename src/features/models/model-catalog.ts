import "../../../data/model-catalog.js";

import type { UsageActivityKind } from "../usage/usage-types";

export interface DemoUsageTemplate {
  activityKind: UsageActivityKind;
  activityLabel: string;
  baseCredits: number;
  modelId: string;
  modelName: string;
  outputImages: number;
  outputVideoSeconds: number;
  order: number;
  specification: string;
  weight: number;
}

export interface ModelDirectoryEntry {
  capabilities: Readonly<Record<string, unknown>>;
  demoUsage: ReadonlyArray<{
    activityLabel: string;
    baseCredits: number;
    outputImages: number;
    outputVideoSeconds: number;
    order: number;
    specification: string;
    weight: number;
  }>;
  id: string;
  name: string;
  provider: string;
  type: UsageActivityKind;
}

interface ModelDirectoryGlobal {
  REELAY_MODEL_DIRECTORY?: ReadonlyArray<ModelDirectoryEntry>;
}

const modelDirectory = (globalThis as ModelDirectoryGlobal).REELAY_MODEL_DIRECTORY;

if (!modelDirectory) {
  throw new Error("Reelay model directory did not initialize.");
}

export const MODEL_DIRECTORY = modelDirectory;

export function getDemoUsageTemplates(): DemoUsageTemplate[] {
  return MODEL_DIRECTORY.flatMap((model) => model.demoUsage.map((template) => ({
    ...template,
    activityKind: model.type,
    modelId: model.id,
    modelName: model.name,
  }))).sort((left, right) => left.order - right.order);
}

export function getModelById(modelId: string): ModelDirectoryEntry | undefined {
  return MODEL_DIRECTORY.find((model) => model.id === modelId);
}
