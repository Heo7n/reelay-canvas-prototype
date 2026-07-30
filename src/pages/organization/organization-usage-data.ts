import type { OrganizationMember } from "../../domain/workspace/workspace";

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

export interface OrganizationUsageDemoData {
  availableCredits: number;
  generatedAt: Date;
  records: UsageRecord[];
}

interface UsageTemplate {
  activityKind: UsageActivityKind;
  activityLabel: string;
  modelId: string;
  modelName: string;
  specification: string;
  weight: number;
  baseCredits: number;
  outputImages: number;
  outputVideoSeconds: number;
}

const FALLBACK_MEMBERS: OrganizationMember[] = [
  { userId: "actor-owner", displayName: "Hoo", loginIdentifier: "creator@reelay.test", role: "owner" },
  { userId: "actor-linjing", displayName: "林静", loginIdentifier: "linjing@reelay.test", role: "admin" },
  { userId: "actor-liran", displayName: "李然", loginIdentifier: "liran@reelay.test", role: "admin" },
  { userId: "actor-chenxi", displayName: "陈曦", loginIdentifier: "chenxi@reelay.test", role: "member" },
  { userId: "actor-zhouyu", displayName: "周予", loginIdentifier: "zhouyu@reelay.test", role: "member" },
  { userId: "actor-suhe", displayName: "苏禾", loginIdentifier: "suhe@reelay.test", role: "member" },
  { userId: "actor-wangyin", displayName: "王茵", loginIdentifier: "wangyin@reelay.test", role: "member" },
  { userId: "actor-xuzhe", displayName: "许哲", loginIdentifier: "xuzhe@reelay.test", role: "member" },
  { userId: "actor-yelan", displayName: "叶澜", loginIdentifier: "yelan@reelay.test", role: "member" },
  { userId: "actor-shenan", displayName: "沈岸", loginIdentifier: "shenan@reelay.test", role: "member" },
];

const PROJECTS = [
  { id: "project-perfume", name: "香水品牌 TVC_最终版", weight: 20 },
  { id: "project-scifi", name: "科幻预告片_初剪版", weight: 18 },
  { id: "project-character", name: "角色动画短片_第 3 版", weight: 17 },
  { id: "project-launch", name: "智能硬件新品发布", weight: 15 },
  { id: "project-spring", name: "春季品牌整合传播", weight: 12 },
  { id: "project-concept", name: "品牌视觉概念", weight: 10 },
] as const;

const DEMO_HISTORY_DAYS = 1_095;
export const ORGANIZATION_TIME_ZONE = "Asia/Shanghai";
const ORGANIZATION_TIME_ZONE_OFFSET = 8 * 60 * 60 * 1_000;

const USAGE_TEMPLATES: UsageTemplate[] = [
  {
    activityKind: "video",
    activityLabel: "文生视频",
    modelId: "seedance-2",
    modelName: "Seedance 2.0",
    specification: "1080p · 10s",
    weight: 14,
    baseCredits: 720,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "video",
    activityLabel: "文生视频",
    modelId: "seedance-2",
    modelName: "Seedance 2.0",
    specification: "720p · 5s",
    weight: 8,
    baseCredits: 380,
    outputImages: 0,
    outputVideoSeconds: 5,
  },
  {
    activityKind: "video",
    activityLabel: "文生视频",
    modelId: "seedance-2",
    modelName: "Seedance 2.0",
    specification: "4K · 10s",
    weight: 3,
    baseCredits: 1_080,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "video",
    activityLabel: "图生视频",
    modelId: "seedance-2-fast",
    modelName: "Seedance 2.0 Fast",
    specification: "720p · 5s",
    weight: 10,
    baseCredits: 360,
    outputImages: 0,
    outputVideoSeconds: 5,
  },
  {
    activityKind: "video",
    activityLabel: "图生视频",
    modelId: "seedance-2-fast",
    modelName: "Seedance 2.0 Fast",
    specification: "480p · 5s",
    weight: 6,
    baseCredits: 240,
    outputImages: 0,
    outputVideoSeconds: 5,
  },
  {
    activityKind: "video",
    activityLabel: "参考生视频",
    modelId: "kling-video-3",
    modelName: "Kling Video 3.0",
    specification: "1080p · 10s",
    weight: 6,
    baseCredits: 660,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "video",
    activityLabel: "参考生视频",
    modelId: "kling-video-3",
    modelName: "Kling Video 3.0",
    specification: "720p · 5s",
    weight: 4,
    baseCredits: 390,
    outputImages: 0,
    outputVideoSeconds: 5,
  },
  {
    activityKind: "video",
    activityLabel: "参考生视频",
    modelId: "kling-video-3",
    modelName: "Kling Video 3.0",
    specification: "4K · 10s",
    weight: 3,
    baseCredits: 1_020,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "video",
    activityLabel: "文生视频",
    modelId: "seedance-2-mini",
    modelName: "Seedance 2.0 Mini",
    specification: "720p · 5s",
    weight: 6,
    baseCredits: 210,
    outputImages: 0,
    outputVideoSeconds: 5,
  },
  {
    activityKind: "video",
    activityLabel: "参考生视频",
    modelId: "veo-3-1",
    modelName: "Veo 3.1",
    specification: "1080p · 8s",
    weight: 3,
    baseCredits: 920,
    outputImages: 0,
    outputVideoSeconds: 8,
  },
  {
    activityKind: "video",
    activityLabel: "参考生视频",
    modelId: "veo-3-1",
    modelName: "Veo 3.1",
    specification: "720p · 8s",
    weight: 2,
    baseCredits: 650,
    outputImages: 0,
    outputVideoSeconds: 8,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "gpt-image-2",
    modelName: "GPT Image 2",
    specification: "高 · 2K · 16:9 · 4 张",
    weight: 12,
    baseCredits: 168,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "gpt-image-2",
    modelName: "GPT Image 2",
    specification: "中 · 2K · 1:1 · 2 张",
    weight: 8,
    baseCredits: 88,
    outputImages: 2,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "gpt-image-2",
    modelName: "GPT Image 2",
    specification: "低 · 1K · 3:2 · 4 张",
    weight: 5,
    baseCredits: 48,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "nano-banana-pro",
    modelName: "Nano Banana Pro",
    specification: "2K · 1:1 · 2 张",
    weight: 12,
    baseCredits: 96,
    outputImages: 2,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "nano-banana-pro",
    modelName: "Nano Banana Pro",
    specification: "4K · 16:9 · 1 张",
    weight: 6,
    baseCredits: 120,
    outputImages: 1,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "midjourney-v8-1",
    modelName: "Midjourney V8.1",
    specification: "2K · 16:9 · 4 张",
    weight: 10,
    baseCredits: 112,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "midjourney-v8-1",
    modelName: "Midjourney V8.1",
    specification: "2K · 1:1 · 4 张",
    weight: 7,
    baseCredits: 112,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "seedream-5-lite",
    modelName: "Seedream 5.0 Lite",
    specification: "4K · 3:2 · 4 张",
    weight: 8,
    baseCredits: 88,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "image",
    activityLabel: "图片生成",
    modelId: "seedream-5-lite",
    modelName: "Seedream 5.0 Lite",
    specification: "2K · 16:9 · 4 张",
    weight: 6,
    baseCredits: 68,
    outputImages: 4,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "enhancement",
    activityLabel: "高清放大",
    modelId: "reelay-hd",
    modelName: "Reelay HD",
    specification: "2× · 4K",
    weight: 7,
    baseCredits: 54,
    outputImages: 1,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "enhancement",
    activityLabel: "高清放大",
    modelId: "reelay-hd",
    modelName: "Reelay HD",
    specification: "4× · 8K",
    weight: 4,
    baseCredits: 92,
    outputImages: 1,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "enhancement",
    activityLabel: "提升帧率",
    modelId: "reelay-frameboost",
    modelName: "Reelay FrameBoost",
    specification: "1080p · 60fps · 10s",
    weight: 5,
    baseCredits: 86,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "enhancement",
    activityLabel: "视频去字幕",
    modelId: "reelay-clean",
    modelName: "Reelay Clean",
    specification: "1080p · 10s",
    weight: 4,
    baseCredits: 72,
    outputImages: 0,
    outputVideoSeconds: 10,
  },
  {
    activityKind: "agent",
    activityLabel: "Agent 处理",
    modelId: "reelay-agent",
    modelName: "Reelay Agent",
    specification: "分镜拆解 · 1 次",
    weight: 9,
    baseCredits: 42,
    outputImages: 0,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "agent",
    activityLabel: "Agent 处理",
    modelId: "reelay-agent",
    modelName: "Reelay Agent",
    specification: "镜头规划 · 1 次",
    weight: 6,
    baseCredits: 38,
    outputImages: 0,
    outputVideoSeconds: 0,
  },
  {
    activityKind: "agent",
    activityLabel: "Agent 处理",
    modelId: "reelay-agent",
    modelName: "Reelay Agent",
    specification: "提示词润色 · 1 次",
    weight: 5,
    baseCredits: 24,
    outputImages: 0,
    outputVideoSeconds: 0,
  },
];

export const USAGE_ACTIVITY_LABELS: Record<UsageActivityKind, string> = {
  image: "图片生成",
  video: "视频生成",
  enhancement: "媒体处理",
  agent: "Agent 处理",
};

const dayFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  timeZone: ORGANIZATION_TIME_ZONE,
});
const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "2-digit",
  month: "short",
  timeZone: ORGANIZATION_TIME_ZONE,
});
const hourFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  hour12: false,
  timeZone: ORGANIZATION_TIME_ZONE,
});

function shiftToOrganizationTime(value: Date): Date {
  return new Date(value.getTime() + ORGANIZATION_TIME_ZONE_OFFSET);
}

function shiftFromOrganizationTime(value: Date): Date {
  return new Date(value.getTime() - ORGANIZATION_TIME_ZONE_OFFSET);
}

export function startOfOrganizationDay(value: Date): Date {
  const shifted = shiftToOrganizationTime(value);
  shifted.setUTCHours(0, 0, 0, 0);
  return shiftFromOrganizationTime(shifted);
}

export function addOrganizationDays(value: Date, amount: number): Date {
  const shifted = shiftToOrganizationTime(value);
  shifted.setUTCDate(shifted.getUTCDate() + amount);
  return shiftFromOrganizationTime(shifted);
}

function addMonths(value: Date, amount: number): Date {
  const shifted = shiftToOrganizationTime(value);
  shifted.setUTCMonth(shifted.getUTCMonth() + amount);
  return shiftFromOrganizationTime(shifted);
}

function startOfMonth(value: Date): Date {
  const shifted = shiftToOrganizationTime(value);
  shifted.setUTCDate(1);
  shifted.setUTCHours(0, 0, 0, 0);
  return shiftFromOrganizationTime(shifted);
}

function parseOrganizationDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(
    Date.UTC(year, Math.max(0, month - 1), day) - ORGANIZATION_TIME_ZONE_OFFSET,
  );
}

export function formatUsageDateInput(value: Date): string {
  const shifted = shiftToOrganizationTime(value);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateKey(value: Date): string {
  const shifted = shiftToOrganizationTime(value);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(value: Date): string {
  const shifted = shiftToOrganizationTime(value);
  return `${shifted.getUTCFullYear()}-${
    String(shifted.getUTCMonth() + 1).padStart(2, "0")
  }`;
}

function clampEventHour(now: Date, dayOffset: number, eventIndex: number): number {
  if (dayOffset !== 0) return 8 + ((eventIndex * 3 + dayOffset) % 13);
  return Math.max(
    0,
    Math.min(shiftToOrganizationTime(now).getUTCHours(), 8 + eventIndex * 2),
  );
}

function deterministicUnit(seed: number): number {
  let value = Math.imul(seed ^ 0x6d2b79f5, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_296;
}

function weightedIndex(weights: number[], seed: number): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return 0;
  let target = deterministicUnit(seed) * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= Math.max(0, weights[index]);
    if (target <= 0) return index;
  }
  return Math.max(0, weights.length - 1);
}

function getDailyEventCount(date: Date, dayOffset: number): number {
  const dayOfWeek = shiftToOrganizationTime(date).getUTCDay();
  const weekendFactor = dayOfWeek === 0 ? 0.28 : dayOfWeek === 6 ? 0.48 : 1;
  const recentGrowth = 0.72 + Math.max(0, 1 - dayOffset / DEMO_HISTORY_DAYS) * 0.38;
  const seasonalFactor = 0.82 + Math.sin((dayOffset + 11) / 17) * 0.18;
  const campaignPhase = dayOffset % 103;
  const campaignFactor = campaignPhase < 6
    ? 3.4
    : campaignPhase < 14
      ? 1.62
      : 1;
  const quietPhase = dayOffset % 149;
  const absenceChance = dayOfWeek === 0 || dayOfWeek === 6 ? 0.24 : 0.07;
  const activitySeed = deterministicUnit(dayOffset * 97 + 31);

  // A short production pause makes holidays and between-campaign gaps visible in the annual trend.
  if (dayOffset > 0 && quietPhase >= 92 && quietPhase <= 105) return 0;
  if (dayOffset > 0 && activitySeed < absenceChance) return 0;

  const intensity = weekendFactor
    * recentGrowth
    * seasonalFactor
    * campaignFactor;
  return Math.max(
    1,
    Math.min(12, Math.round(1 + intensity * (1.4 + activitySeed * 2.4))),
  );
}

export function createOrganizationUsageDemoData(
  members: OrganizationMember[],
  now = new Date(),
): OrganizationUsageDemoData {
  const activeMembers = members.length > 0 ? members : FALLBACK_MEMBERS;
  const records: UsageRecord[] = [];
  const today = startOfOrganizationDay(now);
  const templateWeights = USAGE_TEMPLATES.map((template) => template.weight);
  const projectWeights = PROJECTS.map((project) => project.weight);
  const memberWeights = activeMembers.map((_, index) => Math.max(4, 18 - index * 1.5));

  for (let dayOffset = 0; dayOffset < DEMO_HISTORY_DAYS; dayOffset += 1) {
    const date = addOrganizationDays(today, -dayOffset);
    const eventCount = getDailyEventCount(date, dayOffset);

    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const seed = dayOffset * 131 + eventIndex * 29;
      const template = USAGE_TEMPLATES[weightedIndex(templateWeights, seed + 7)];
      const member = activeMembers[weightedIndex(memberWeights, seed + 19)];
      const project = PROJECTS[weightedIndex(projectWeights, seed + 37)];
      const occurredAt = new Date(
        date.getTime()
        + clampEventHour(now, dayOffset, eventIndex) * 60 * 60 * 1_000
        + ((eventIndex * 11) % 60) * 60 * 1_000,
      );
      const costVariation = 0.86 + deterministicUnit(seed + 53) * 0.3;
      const credits = Math.max(1, Math.round(template.baseCredits * costVariation));

      records.push({
        id: `usage-${localDateKey(date)}-${eventIndex}`,
        occurredAt: occurredAt.toISOString(),
        memberId: member.userId,
        memberName: member.displayName,
        memberAccount: member.loginIdentifier ?? "未绑定登录标识",
        projectId: project.id,
        projectName: project.name,
        activityKind: template.activityKind,
        activityLabel: template.activityLabel,
        modelId: template.modelId,
        modelName: template.modelName,
        specification: template.specification,
        credits,
        outputImages: template.outputImages,
        outputVideoSeconds: template.outputVideoSeconds,
        status: "settled",
      });
    }

    if (dayOffset > 0 && dayOffset % 43 === 9) {
      const source = records.at(-1);
      if (!source) continue;
      records.push({
        ...source,
        id: `${source.id}-refund`,
        occurredAt: new Date(new Date(source.occurredAt).getTime() + 18 * 60 * 1000).toISOString(),
        activityLabel: `${source.activityLabel}退款`,
        credits: -Math.round(source.credits * 0.5),
        outputImages: 0,
        outputVideoSeconds: 0,
        status: "refunded",
      });
    }
  }

  return {
    availableCredits: 100_000,
    generatedAt: new Date(now.getTime() - 5 * 60 * 1000),
    records: records.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
  };
}

export function getUsageRange(
  preset: UsageRangePreset,
  now: Date,
  customStart?: string,
  customEnd?: string,
  historyStart?: Date,
): DateRange {
  const end = new Date(now);
  const today = startOfOrganizationDay(now);

  if (preset === "today") return { start: today, end };
  if (preset === "rolling7") {
    return { start: addOrganizationDays(today, -6), end };
  }
  if (preset === "rolling30") {
    return { start: addOrganizationDays(today, -29), end };
  }
  if (preset === "month") {
    return { start: startOfMonth(today), end };
  }
  if (preset === "previousMonth") {
    const currentMonthStart = startOfMonth(today);
    return {
      start: addMonths(currentMonthStart, -1),
      end: currentMonthStart,
    };
  }
  if (preset === "custom" && customStart && customEnd) {
    const start = parseOrganizationDateInput(customStart);
    const inclusiveEnd = addOrganizationDays(parseOrganizationDateInput(customEnd), 1);
    return { start, end: inclusiveEnd < end ? inclusiveEnd : end };
  }
  return {
    start: historyStart
      ? startOfOrganizationDay(historyStart)
      : addOrganizationDays(today, -(DEMO_HISTORY_DAYS - 1)),
    end,
  };
}

export function getComparisonRange(preset: UsageRangePreset, range: DateRange): DateRange | null {
  if (preset === "all") return null;

  if (preset === "today") {
    const comparisonStart = addOrganizationDays(range.start, -1);
    return {
      start: comparisonStart,
      end: new Date(comparisonStart.getTime() + (range.end.getTime() - range.start.getTime())),
    };
  }

  if (preset === "month") {
    const previousMonthStart = addMonths(range.start, -1);
    const elapsed = range.end.getTime() - range.start.getTime();
    return {
      start: previousMonthStart,
      end: new Date(Math.min(
        previousMonthStart.getTime() + elapsed,
        range.start.getTime(),
      )),
    };
  }

  if (preset === "previousMonth") {
    return {
      start: addMonths(range.start, -1),
      end: new Date(range.start),
    };
  }

  if (preset === "rolling7") {
    return {
      start: addOrganizationDays(range.start, -7),
      end: addOrganizationDays(range.end, -7),
    };
  }

  if (preset === "rolling30") {
    return {
      start: addOrganizationDays(range.start, -30),
      end: addOrganizationDays(range.end, -30),
    };
  }

  const duration = range.end.getTime() - range.start.getTime();
  return {
    start: new Date(range.start.getTime() - duration),
    end: new Date(range.start),
  };
}

export function filterUsageRecords(
  records: UsageRecord[],
  range: DateRange,
  filters: UsageFilters = { memberId: "", projectId: "", activityKind: "", modelId: "" },
): UsageRecord[] {
  return records.filter((record) => {
    const occurredAt = new Date(record.occurredAt);
    return occurredAt >= range.start
      && occurredAt < range.end
      && (!filters.memberId || record.memberId === filters.memberId)
      && (!filters.projectId || record.projectId === filters.projectId)
      && (!filters.activityKind || record.activityKind === filters.activityKind)
      && (!filters.modelId || record.modelId === filters.modelId);
  });
}

function totalCredits(records: UsageRecord[]): number {
  return records.reduce((total, record) => total + record.credits, 0);
}

function buildRecentDailyCredits(
  records: UsageRecord[],
  now: Date,
  dayCount: number,
): number[] {
  const end = startOfOrganizationDay(now);
  const start = addOrganizationDays(end, -(dayCount - 1));
  const dailyCredits = Array.from({ length: dayCount }, () => 0);

  records.forEach((record) => {
    const occurredAt = startOfOrganizationDay(new Date(record.occurredAt));
    const dayIndex = Math.floor((occurredAt.getTime() - start.getTime()) / 86_400_000);
    if (dayIndex >= 0 && dayIndex < dayCount) {
      dailyCredits[dayIndex] += record.credits;
    }
  });

  return dailyCredits.map((credits) => Math.max(0, credits));
}

function getWeightedDailyAverage(values: number[], halfLifeDays: number): number {
  if (values.length === 0) return 0;

  let weightedTotal = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    const age = values.length - 1 - index;
    const weight = 0.5 ** (age / halfLifeDays);
    weightedTotal += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedTotal / totalWeight : 0;
}

export function getUsageSummary(
  records: UsageRecord[],
  previousRecords: UsageRecord[],
  allRecords: UsageRecord[],
  now: Date,
  availableCredits: number,
): UsageSummary {
  const netCredits = totalCredits(records);
  const previousCredits = totalCredits(previousRecords);
  const firstRecord = allRecords.at(-1);
  const lifetimeStart = firstRecord
    ? startOfOrganizationDay(new Date(firstRecord.occurredAt))
    : startOfOrganizationDay(now);
  const lifetimeDays = Math.max(
    1,
    Math.floor(
      (startOfOrganizationDay(now).getTime() - lifetimeStart.getTime()) / 86_400_000,
    ) + 1,
  );
  const lifetimeDailyAverage = Math.max(0, Math.round(totalCredits(allRecords) / lifetimeDays));
  const recentObservationDays = Math.min(30, lifetimeDays);
  const recentDailyCredits = buildRecentDailyCredits(
    allRecords,
    now,
    recentObservationDays,
  );
  const recentSimpleAverage = recentDailyCredits.reduce(
    (total, credits) => total + credits,
    0,
  ) / recentObservationDays;
  const recentWeightedAverage = getWeightedDailyAverage(recentDailyCredits, 10);
  const recentDailyAverage = Math.max(
    0,
    Math.round((recentSimpleAverage * 0.35) + (recentWeightedAverage * 0.65)),
  );

  return {
    netCredits,
    changeRate: previousCredits > 0 ? (netCredits - previousCredits) / previousCredits : null,
    imageCount: records.reduce((total, record) => total + record.outputImages, 0),
    videoSeconds: records.reduce((total, record) => total + record.outputVideoSeconds, 0),
    recentDailyAverage,
    lifetimeDailyAverage,
    estimatedDaysRecent: recentDailyAverage > 0
      ? Math.max(1, Math.floor(availableCredits / recentDailyAverage))
      : null,
    recentToLifetimeRate: lifetimeDailyAverage > 0
      ? (recentDailyAverage - lifetimeDailyAverage) / lifetimeDailyAverage
      : null,
  };
}

export function getUsageComposition(
  records: UsageRecord[],
  dimension: UsageDimension,
): UsageCompositionItem[] {
  const dimensionRecords = dimension === "model"
    ? records.filter((record) =>
        record.activityKind === "image" || record.activityKind === "video"
      )
    : records;
  const groups = new Map<string, UsageCompositionItem>();
  const total = Math.max(0, totalCredits(dimensionRecords));

  dimensionRecords.forEach((record) => {
    const id = dimension === "type"
      ? record.activityKind
      : dimension === "member"
        ? record.memberId
        : dimension === "project"
          ? record.projectId
          : record.modelId;
    const label = dimension === "type"
      ? USAGE_ACTIVITY_LABELS[record.activityKind]
      : dimension === "member"
        ? record.memberName
        : dimension === "project"
          ? record.projectName
          : record.modelName;
    const detail = dimension === "type"
      ? record.activityKind === "video"
        ? "视频生成与延展"
        : record.activityKind === "image"
          ? "图片生成与编辑"
          : record.activityKind === "agent"
            ? "Agent 规划与处理"
            : "高清化等媒体处理"
      : dimension === "member"
        ? record.memberAccount
        : dimension === "project"
          ? "项目"
          : `${USAGE_ACTIVITY_LABELS[record.activityKind]} · ${record.specification}`;
    const current = groups.get(id) ?? {
      id,
      label,
      detail,
      credits: 0,
      share: 0,
      imageCount: 0,
      videoSeconds: 0,
      tasks: 0,
    };
    current.credits += record.credits;
    current.imageCount += record.outputImages;
    current.videoSeconds += record.outputVideoSeconds;
    current.tasks += record.status === "settled" ? 1 : 0;
    groups.set(id, current);
  });

  const order: UsageActivityKind[] = ["video", "image", "agent", "enhancement"];
  const sortedItems = [...groups.values()]
    .map((item) => ({
      ...item,
      credits: Math.max(0, item.credits),
      share: total > 0 ? Math.max(0, item.credits) / total : 0,
    }))
    .sort((left, right) => {
      if (dimension === "type") {
        return order.indexOf(left.id as UsageActivityKind)
          - order.indexOf(right.id as UsageActivityKind);
      }
      const creditOrder = right.credits - left.credits;
      return creditOrder !== 0
        ? creditOrder
        : left.label.localeCompare(right.label, "zh-CN");
    });

  return sortedItems;
}

export function getUsageTrend(records: UsageRecord[], range: DateRange): UsageTrendPoint[] {
  const durationDays = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000));
  const mode = durationDays <= 1 ? "hour" : durationDays <= 62 ? "day" : "month";
  const buckets = new Map<string, UsageTrendPoint>();

  const createPoint = (date: Date): UsageTrendPoint => {
    if (mode === "hour") {
      const organizationHour = shiftToOrganizationTime(date).getUTCHours();
      const key = `${localDateKey(date)}-${String(organizationHour).padStart(2, "0")}`;
      return { key, label: hourFormatter.format(date), credits: 0, tasks: 0 };
    }
    if (mode === "day") {
      return { key: localDateKey(date), label: dayFormatter.format(date), credits: 0, tasks: 0 };
    }
    return { key: monthKey(date), label: monthFormatter.format(date), credits: 0, tasks: 0 };
  };

  if (mode === "hour") {
    const organizationHour = shiftToOrganizationTime(range.end).getUTCHours();
    for (let hour = 0; hour <= organizationHour; hour += 2) {
      const date = new Date(range.start.getTime() + hour * 60 * 60 * 1_000);
      const point = createPoint(date);
      buckets.set(point.key, point);
    }
  } else if (mode === "day") {
    for (
      let date = startOfOrganizationDay(range.start);
      date < range.end;
      date = addOrganizationDays(date, 1)
    ) {
      const point = createPoint(date);
      buckets.set(point.key, point);
    }
  } else {
    const monthStart = startOfMonth(range.start);
    for (let date = monthStart; date < range.end; date = addMonths(date, 1)) {
      const point = createPoint(date);
      buckets.set(point.key, point);
    }
  }

  records.forEach((record) => {
    const point = createPoint(new Date(record.occurredAt));
    const bucket = buckets.get(point.key) ?? point;
    bucket.credits += record.credits;
    bucket.tasks += record.status === "settled" ? 1 : 0;
    buckets.set(point.key, bucket);
  });

  return [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function getHeatmapDays(records: UsageRecord[], now: Date): HeatmapDay[] {
  const totals = new Map<string, { credits: number; tasks: number }>();
  const start = addOrganizationDays(startOfOrganizationDay(now), -364);
  records.forEach((record) => {
    const date = new Date(record.occurredAt);
    if (date < start || date > now) return;
    const key = localDateKey(date);
    const current = totals.get(key) ?? { credits: 0, tasks: 0 };
    current.credits += record.credits;
    current.tasks += record.status === "settled" ? 1 : 0;
    totals.set(key, current);
  });
  const values = [...totals.values()]
    .map((value) => value.credits)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  const quantile = (ratio: number) => (
    values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0
  );
  const thresholds = [quantile(0.25), quantile(0.5), quantile(0.75)];

  return Array.from({ length: 365 }, (_, index) => {
    const date = addOrganizationDays(start, index);
    const key = localDateKey(date);
    const total = totals.get(key) ?? { credits: 0, tasks: 0 };
    const level: HeatmapDay["level"] = total.credits <= 0
      ? 0
      : total.credits <= thresholds[0]
        ? 1
        : total.credits <= thresholds[1]
          ? 2
          : total.credits <= thresholds[2]
            ? 3
            : 4;
    return { key, date, credits: total.credits, tasks: total.tasks, level };
  });
}

export function getWeeklyActivity(
  records: UsageRecord[],
  anchor: Date,
): UsageActivityPoint[] {
  const endExclusive = addOrganizationDays(startOfOrganizationDay(anchor), 1);
  const start = addOrganizationDays(endExclusive, -364);
  const points = Array.from({ length: 52 }, (_, index) => {
    const pointStart = addOrganizationDays(start, index * 7);
    const pointEnd = addOrganizationDays(pointStart, 7);
    return {
      key: localDateKey(pointStart),
      label: `${dayFormatter.format(pointStart)}–${
        dayFormatter.format(addOrganizationDays(pointEnd, -1))
      }`,
      credits: 0,
      cumulativeCredits: 0,
      start: pointStart,
      end: pointEnd,
    };
  });

  records.forEach((record) => {
    const occurredAt = new Date(record.occurredAt);
    if (occurredAt < start || occurredAt >= endExclusive) return;
    const index = Math.min(
      51,
      Math.floor((occurredAt.getTime() - start.getTime()) / (7 * 86_400_000)),
    );
    points[index].credits += record.credits;
  });

  let cumulativeCredits = 0;
  return points.map((point) => {
    cumulativeCredits += point.credits;
    return { ...point, cumulativeCredits };
  });
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function buildUsageCsv(records: UsageRecord[]): string {
  const header = ["时间", "成员", "账号", "项目", "任务类型", "模型", "规格", "图片张数", "视频时长（秒）", "积分变化", "状态"];
  const rows = records.map((record) => [
    new Date(record.occurredAt).toLocaleString("zh-CN"),
    record.memberName,
    record.memberAccount,
    record.projectName,
    record.activityLabel,
    record.modelName,
    record.specification,
    record.outputImages,
    record.outputVideoSeconds,
    record.credits,
    record.status === "refunded" ? "已退款" : "已结算",
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function buildExcelWorksheet(
  name: string,
  rows: Array<Array<string | number>>,
): string {
  const body = rows
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${body}</Table></Worksheet>`;
}

export function buildUsageExcelXml(
  records: UsageRecord[],
  rangeLabel?: string,
): string {
  const netCredits = records.reduce((total, record) => total + record.credits, 0);
  const settledTasks = records.filter((record) => record.status === "settled").length;
  const imageCount = records.reduce((total, record) => total + record.outputImages, 0);
  const videoSeconds = records.reduce((total, record) => total + record.outputVideoSeconds, 0);
  const dailyUsage = new Map<
    string,
    { credits: number; records: number; imageCount: number; videoSeconds: number }
  >();
  records.forEach((record) => {
    const date = localDateKey(new Date(record.occurredAt));
    const current = dailyUsage.get(date) ?? {
      credits: 0,
      records: 0,
      imageCount: 0,
      videoSeconds: 0,
    };
    current.credits += record.credits;
    current.records += 1;
    current.imageCount += record.outputImages;
    current.videoSeconds += record.outputVideoSeconds;
    dailyUsage.set(date, current);
  });
  const overviewRows: Array<Array<string | number>> = [
    ["指标", "数值"],
    ...(rangeLabel ? [["统计范围", rangeLabel]] : []),
    ["积分消耗", netCredits],
    ["已结算任务", settledTasks],
    ["图片产出", imageCount],
    ["视频产出（秒）", videoSeconds],
  ];
  const dailyRows: Array<Array<string | number>> = [
    ["日期", "积分消耗", "记录数", "图片张数", "视频时长（秒）"],
    ...Array.from(dailyUsage.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, usage]) => [
        date,
        usage.credits,
        usage.records,
        usage.imageCount,
        usage.videoSeconds,
      ]),
  ];
  const buildRankingRows = (dimension: UsageDimension): Array<Array<string | number>> => [
    ["名称", "积分消耗", "占比", "任务数", "图片张数", "视频时长（秒）"],
    ...getUsageComposition(records, dimension).map((item) => [
      item.label,
      item.credits,
      `${(item.share * 100).toFixed(1)}%`,
      item.tasks,
      item.imageCount,
      item.videoSeconds,
    ]),
  ];
  const worksheets = [
    buildExcelWorksheet("组织用量", overviewRows),
    buildExcelWorksheet("每日用量", dailyRows),
    buildExcelWorksheet("消耗构成", buildRankingRows("type")),
    buildExcelWorksheet("模型排行", buildRankingRows("model")),
    buildExcelWorksheet("成员排行", buildRankingRows("member")),
    buildExcelWorksheet("项目排行", buildRankingRows("project")),
  ].join("");

  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets}</Workbook>`;
}
