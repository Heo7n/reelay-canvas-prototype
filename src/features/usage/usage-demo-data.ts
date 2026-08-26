import { getDemoUsageTemplates } from "../models/model-catalog";
import {
  addOrganizationDays,
  startOfOrganizationDay,
  usageDateKey,
} from "./usage-analytics";
import type { UsageDemoData, UsageDemoMember, UsageRecord } from "./usage-types";

const FALLBACK_MEMBERS: UsageDemoMember[] = [
  { userId: "actor-owner", displayName: "Hoo", loginIdentifier: "creator@reelay.test" },
  { userId: "actor-linjing", displayName: "林静", loginIdentifier: "linjing@reelay.test" },
  { userId: "actor-liran", displayName: "李然", loginIdentifier: "liran@reelay.test" },
  { userId: "actor-chenxi", displayName: "陈曦", loginIdentifier: "chenxi@reelay.test" },
  { userId: "actor-zhouyu", displayName: "周予", loginIdentifier: "zhouyu@reelay.test" },
  { userId: "actor-suhe", displayName: "苏禾", loginIdentifier: "suhe@reelay.test" },
  { userId: "actor-wangyin", displayName: "王茵", loginIdentifier: "wangyin@reelay.test" },
  { userId: "actor-xuzhe", displayName: "许哲", loginIdentifier: "xuzhe@reelay.test" },
  { userId: "actor-yelan", displayName: "叶澜", loginIdentifier: "yelan@reelay.test" },
  { userId: "actor-shenan", displayName: "沈岸", loginIdentifier: "shenan@reelay.test" },
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
const ORGANIZATION_TIME_ZONE_OFFSET = 8 * 60 * 60 * 1_000;

function shiftToOrganizationTime(value: Date): Date {
  return new Date(value.getTime() + ORGANIZATION_TIME_ZONE_OFFSET);
}

function clampEventHour(now: Date, dayOffset: number, eventIndex: number): number {
  if (dayOffset !== 0) return 8 + ((eventIndex * 3 + dayOffset) % 13);
  const latestCompletedHour = Math.max(0, shiftToOrganizationTime(now).getUTCHours() - 1);
  return Math.max(0, Math.min(latestCompletedHour, 8 + eventIndex * 2));
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

function isOccasionalSaturdayRestDay(dayOffset: number): boolean {
  return deterministicUnit(dayOffset * 193 + 109) < 0.14;
}

function getDailyEventCount(date: Date, dayOffset: number): number {
  const dayOfWeek = shiftToOrganizationTime(date).getUTCDay();
  const activitySeed = deterministicUnit(dayOffset * 97 + 31);
  if (dayOfWeek === 6) {
    return isOccasionalSaturdayRestDay(dayOffset) ? 0 : 3 + Math.floor(activitySeed * 4);
  }
  return dayOfWeek === 0
    ? 6 + Math.floor(activitySeed * 3)
    : 9 + Math.floor(activitySeed * 5);
}

function getDailyCreditTarget(date: Date, dayOffset: number): number {
  const dayOfWeek = shiftToOrganizationTime(date).getUTCDay();
  const volumeSeed = deterministicUnit(dayOffset * 151 + 73);
  if (dayOfWeek === 6) {
    return isOccasionalSaturdayRestDay(dayOffset)
      ? 0
      : Math.round(2_800 + volumeSeed * 2_400);
  }
  return dayOfWeek === 0
    ? Math.round(5_200 + volumeSeed * 1_200)
    : Math.round(6_500 + volumeSeed * 3_200);
}

export function createUsageDemoData(
  members: readonly UsageDemoMember[],
  now = new Date(),
): UsageDemoData {
  const activeMembers = members.length > 0 ? members : FALLBACK_MEMBERS;
  const templates = getDemoUsageTemplates();
  const records: UsageRecord[] = [];
  const today = startOfOrganizationDay(now);
  const templateWeights = templates.map((template) => template.weight);
  const projectWeights = PROJECTS.map((project) => project.weight);
  const memberWeights = activeMembers.map((_, index) => Math.max(4, 18 - index * 1.5));

  for (let dayOffset = 0; dayOffset < DEMO_HISTORY_DAYS; dayOffset += 1) {
    const date = addOrganizationDays(today, -dayOffset);
    const eventCount = getDailyEventCount(date, dayOffset);
    const dayRecordStart = records.length;

    for (let eventIndex = 0; eventIndex < eventCount; eventIndex += 1) {
      const seed = dayOffset * 131 + eventIndex * 29;
      const template = templates[weightedIndex(templateWeights, seed + 7)];
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
        id: `usage-${usageDateKey(date)}-${eventIndex}`,
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

    const dayRecords = records.slice(dayRecordStart);
    const dailyTarget = getDailyCreditTarget(date, dayOffset);
    const unscaledTotal = dayRecords.reduce((sum, record) => sum + record.credits, 0);
    if (dailyTarget > 0 && unscaledTotal > 0) {
      const scale = dailyTarget / unscaledTotal;
      let scaledTotal = 0;
      dayRecords.forEach((record) => {
        record.credits = Math.max(1, Math.round(record.credits * scale));
        scaledTotal += record.credits;
      });
      dayRecords[0].credits += dailyTarget - scaledTotal;
    }

    if (dayOffset > 0 && dayOffset % 43 === 9) {
      const source = records.at(-1);
      if (!source) continue;
      records.push({
        ...source,
        id: `${source.id}-refund`,
        occurredAt: new Date(new Date(source.occurredAt).getTime() + 18 * 60 * 1_000).toISOString(),
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
    generatedAt: new Date(now.getTime() - 5 * 60 * 1_000),
    records: records.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
  };
}
