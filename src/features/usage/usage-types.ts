export type UsageRangePreset =
  | "today"
  | "rolling7"
  | "rolling30"
  | "month"
  | "previousMonth"
  | "all"
  | "custom";
export type UsageActivityKind = "image" | "video" | "enhancement" | "agent";
export type UsageDimension = "type" | "member" | "project" | "model";

export interface UsageRecord {
  id: string;
  occurredAt: string;
  memberId: string;
  memberName: string;
  memberAccount: string;
  projectId: string;
  projectName: string;
  activityKind: UsageActivityKind;
  activityLabel: string;
  modelId: string;
  modelName: string;
  specification: string;
  credits: number;
  outputImages: number;
  outputVideoSeconds: number;
  status: "settled" | "refunded";
}

export interface UsageFilters {
  memberId: string;
  projectId: string;
  activityKind: "" | UsageActivityKind;
  modelId: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface UsageSummary {
  netCredits: number;
  changeRate: number | null;
  imageCount: number;
  videoSeconds: number;
  recentDailyAverage: number;
  lifetimeDailyAverage: number;
  estimatedDaysRecent: number | null;
  recentToLifetimeRate: number | null;
}

export interface UsageTrendPoint {
  key: string;
  label: string;
  credits: number;
  tasks: number;
}

export interface UsageCompositionItem {
  id: string;
  label: string;
  detail: string;
  credits: number;
  share: number;
  imageCount: number;
  videoSeconds: number;
  tasks: number;
}

export interface UsageActivityPoint {
  key: string;
  label: string;
  credits: number;
  cumulativeCredits: number;
  start: Date;
  end: Date;
}

export interface HeatmapDay {
  key: string;
  date: Date;
  credits: number;
  tasks: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface UsageDemoData {
  availableCredits: number;
  generatedAt: Date;
  records: UsageRecord[];
}

export interface UsageDemoMember {
  displayName: string;
  loginIdentifier?: string | null;
  userId: string;
}
