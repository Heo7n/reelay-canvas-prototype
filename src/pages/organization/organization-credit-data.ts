import type { OrganizationMember } from "../../domain/workspace/workspace";

export const ORGANIZATION_CREDIT_SUMMARY = {
  lifetimeIncome: 180_000,
  consumed: 80_000,
  available: 100_000,
  allocated: 33_000,
  unallocated: 67_000,
} as const;

export type CreditIncomeKind = "purchase" | "grant" | "adjustment";

export interface CreditIncomeRecord {
  id: string;
  kind: CreditIncomeKind;
  source: string;
  description: string;
  amount: number;
  date: string;
}

export const CREDIT_INCOME_RECORDS: CreditIncomeRecord[] = [
  {
    id: "IN-20260720-01",
    kind: "purchase",
    source: "组织积分充值",
    description: "企业创作积分包",
    amount: 60_000,
    date: "2026-07-20 10:26",
  },
  {
    id: "IN-20260620-01",
    kind: "purchase",
    source: "组织积分充值",
    description: "企业创作积分包",
    amount: 50_000,
    date: "2026-06-20 14:08",
  },
  {
    id: "IN-20260515-01",
    kind: "purchase",
    source: "组织积分充值",
    description: "标准积分包",
    amount: 40_000,
    date: "2026-05-15 09:42",
  },
  {
    id: "IN-20260418-01",
    kind: "grant",
    source: "年度方案赠送",
    description: "年度合作方案权益",
    amount: 20_000,
    date: "2026-04-18 16:30",
  },
  {
    id: "IN-20260330-01",
    kind: "adjustment",
    source: "运营额度调整",
    description: "历史任务补偿",
    amount: 10_000,
    date: "2026-03-30 11:12",
  },
];

export type CreditAllocationAction = "grant" | "reclaim" | "consume";
export type CreditGenerationTaskType = "图片生成" | "图生视频" | "参考生视频";
export type CreditGenerationResolution = "720p" | "1080p" | "1K" | "2K" | "4K";
export type CreditGenerationAspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";

export interface CreditGenerationSpec {
  resolution: CreditGenerationResolution;
  aspectRatio: CreditGenerationAspectRatio;
  imageCount?: number;
  durationSeconds?: number;
}

export type CreditAllocationValidity =
  | { kind: "permanent" }
  | { kind: "until"; endsAt: string }
  | { kind: "range"; startsAt: string; endsAt: string };

export interface CreditAllocationRecord {
  id: string;
  action: CreditAllocationAction;
  memberAccount: string;
  memberName: string;
  amount: number;
  balanceAfter: number;
  operator: string;
  note: string;
  date: string;
  validity?: CreditAllocationValidity;
  projectName?: string;
  taskType?: CreditGenerationTaskType;
  modelName?: string;
  generationSpec?: CreditGenerationSpec;
}

export const CREDIT_ALLOCATION_RECORDS: CreditAllocationRecord[] = [
  {
    id: "US-20260726-02",
    action: "consume",
    memberAccount: "linjing@reelay.test",
    memberName: "林静",
    amount: -2_500,
    balanceAfter: 8_000,
    operator: "系统",
    note: "Seedance 2.0 · 1080p · 10s",
    date: "2026-07-26 16:42",
    projectName: "科幻预告片_初剪版",
    taskType: "参考生视频",
    modelName: "Seedance 2.0",
    generationSpec: {
      resolution: "1080p",
      aspectRatio: "16:9",
      durationSeconds: 10,
    },
  },
  {
    id: "US-20260726-01",
    action: "consume",
    memberAccount: "creator@reelay.test",
    memberName: "Hoo",
    amount: -800,
    balanceAfter: 12_000,
    operator: "系统",
    note: "GPT Image 2 · 2K · 4 张",
    date: "2026-07-26 11:08",
    projectName: "香水品牌 TVC_最终版",
    taskType: "图片生成",
    modelName: "GPT Image 2",
    generationSpec: {
      resolution: "2K",
      aspectRatio: "1:1",
      imageCount: 4,
    },
  },
  {
    id: "US-20260725-02",
    action: "consume",
    memberAccount: "chenxi@reelay.test",
    memberName: "陈曦",
    amount: -1_200,
    balanceAfter: 5_000,
    operator: "系统",
    note: "Seedream 5.0 Pro · 4K · 2 张",
    date: "2026-07-25 19:24",
    projectName: "角色动画短片_第 3 版",
    taskType: "图片生成",
    modelName: "Seedream 5.0 Pro",
    generationSpec: {
      resolution: "4K",
      aspectRatio: "9:16",
      imageCount: 2,
    },
  },
  {
    id: "AL-20260725-01",
    action: "grant",
    memberAccount: "creator@reelay.test",
    memberName: "Hoo",
    amount: 3_000,
    balanceAfter: 12_800,
    operator: "Hoo",
    note: "主账户 7 月追加额度",
    date: "2026-07-25 10:18",
    validity: {
      kind: "range",
      startsAt: "2026-07-25",
      endsAt: "2026-08-24",
    },
  },
  {
    id: "US-20260724-02",
    action: "consume",
    memberAccount: "suhe@reelay.test",
    memberName: "苏禾",
    amount: -1_500,
    balanceAfter: 4_000,
    operator: "系统",
    note: "Kling Video 3.0 · 1080p · 5s",
    date: "2026-07-24 20:10",
    projectName: "产品视觉广告_旁白已配",
    taskType: "图生视频",
    modelName: "Kling Video 3.0",
    generationSpec: {
      resolution: "1080p",
      aspectRatio: "16:9",
      durationSeconds: 5,
    },
  },
  {
    id: "AL-20260724-01",
    action: "grant",
    memberAccount: "linjing@reelay.test",
    memberName: "林静",
    amount: 2_000,
    balanceAfter: 10_500,
    operator: "Hoo",
    note: "品牌项目追加额度",
    date: "2026-07-24 16:36",
    validity: { kind: "permanent" },
  },
  {
    id: "US-20260723-01",
    action: "consume",
    memberAccount: "zhouyu@reelay.test",
    memberName: "周予",
    amount: -1_000,
    balanceAfter: 4_000,
    operator: "系统",
    note: "Nano Banana Pro · 2K · 5 张",
    date: "2026-07-23 14:26",
    projectName: "品牌故事片脚本",
    taskType: "图片生成",
    modelName: "Nano Banana Pro",
    generationSpec: {
      resolution: "2K",
      aspectRatio: "16:9",
      imageCount: 5,
    },
  },
  {
    id: "AL-20260722-01",
    action: "grant",
    memberAccount: "chenxi@reelay.test",
    memberName: "陈曦",
    amount: 2_000,
    balanceAfter: 6_200,
    operator: "Hoo",
    note: "短片项目追加额度",
    date: "2026-07-22 09:20",
    validity: {
      kind: "range",
      startsAt: "2026-07-22",
      endsAt: "2026-08-21",
    },
  },
  {
    id: "US-20260721-01",
    action: "consume",
    memberAccount: "creator@reelay.test",
    memberName: "Hoo",
    amount: -1_200,
    balanceAfter: 9_800,
    operator: "系统",
    note: "Seedance 2.0 Fast · 720p · 10s",
    date: "2026-07-21 18:52",
    projectName: "科幻预告片_初剪版",
    taskType: "图生视频",
    modelName: "Seedance 2.0 Fast",
    generationSpec: {
      resolution: "720p",
      aspectRatio: "21:9",
      durationSeconds: 10,
    },
  },
  {
    id: "AL-20260720-01",
    action: "grant",
    memberAccount: "suhe@reelay.test",
    memberName: "苏禾",
    amount: 1_500,
    balanceAfter: 5_500,
    operator: "林静",
    note: "产品演示项目追加额度",
    date: "2026-07-20 15:04",
    validity: { kind: "until", endsAt: "2026-08-31" },
  },
  {
    id: "US-20260719-01",
    action: "consume",
    memberAccount: "linjing@reelay.test",
    memberName: "林静",
    amount: -1_500,
    balanceAfter: 8_500,
    operator: "系统",
    note: "Midjourney V7 · 2K · 3 张",
    date: "2026-07-19 13:18",
    projectName: "香水品牌 TVC_最终版",
    taskType: "图片生成",
    modelName: "Midjourney V7",
    generationSpec: {
      resolution: "2K",
      aspectRatio: "1:1",
      imageCount: 3,
    },
  },
  {
    id: "AL-20260718-01",
    action: "reclaim",
    memberAccount: "zhouyu@reelay.test",
    memberName: "周予",
    amount: -1_000,
    balanceAfter: 5_000,
    operator: "Hoo",
    note: "闲置额度回收",
    date: "2026-07-18 18:12",
  },
  {
    id: "US-20260718-01",
    action: "consume",
    memberAccount: "chenxi@reelay.test",
    memberName: "陈曦",
    amount: -1_800,
    balanceAfter: 4_200,
    operator: "系统",
    note: "Kling Video 3.0 Omni · 720p · 8s",
    date: "2026-07-18 11:46",
    projectName: "角色动画短片_第 3 版",
    taskType: "参考生视频",
    modelName: "Kling Video 3.0 Omni",
    generationSpec: {
      resolution: "720p",
      aspectRatio: "9:16",
      durationSeconds: 8,
    },
  },
  {
    id: "US-20260716-01",
    action: "consume",
    memberAccount: "suhe@reelay.test",
    memberName: "苏禾",
    amount: -1_000,
    balanceAfter: 4_000,
    operator: "系统",
    note: "GPT Image 2 · 2K · 5 张",
    date: "2026-07-16 17:32",
    projectName: "产品视觉广告_旁白已配",
    taskType: "图片生成",
    modelName: "GPT Image 2",
    generationSpec: {
      resolution: "2K",
      aspectRatio: "16:9",
      imageCount: 5,
    },
  },
  {
    id: "US-20260715-01",
    action: "consume",
    memberAccount: "zhouyu@reelay.test",
    memberName: "周予",
    amount: -1_000,
    balanceAfter: 6_000,
    operator: "系统",
    note: "Seedream 5.0 Lite · 2K · 5 张",
    date: "2026-07-15 10:05",
    projectName: "品牌故事片脚本",
    taskType: "图片生成",
    modelName: "Seedream 5.0 Lite",
    generationSpec: {
      resolution: "2K",
      aspectRatio: "4:3",
      imageCount: 5,
    },
  },
  {
    id: "AL-20260710-01",
    action: "grant",
    memberAccount: "creator@reelay.test",
    memberName: "Hoo",
    amount: 11_000,
    balanceAfter: 11_000,
    operator: "Hoo",
    note: "主账户月度基础额度",
    date: "2026-07-10 09:00",
    validity: {
      kind: "range",
      startsAt: "2026-07-10",
      endsAt: "2026-07-31",
    },
  },
  {
    id: "AL-20260708-01",
    action: "grant",
    memberAccount: "linjing@reelay.test",
    memberName: "林静",
    amount: 10_000,
    balanceAfter: 10_000,
    operator: "Hoo",
    note: "管理员月度基础额度",
    date: "2026-07-08 09:15",
    validity: { kind: "permanent" },
  },
  {
    id: "AL-20260706-01",
    action: "grant",
    memberAccount: "chenxi@reelay.test",
    memberName: "陈曦",
    amount: 6_000,
    balanceAfter: 6_000,
    operator: "林静",
    note: "成员月度创作额度",
    date: "2026-07-06 10:42",
    validity: {
      kind: "range",
      startsAt: "2026-07-06",
      endsAt: "2026-07-31",
    },
  },
  {
    id: "AL-20260705-01",
    action: "grant",
    memberAccount: "suhe@reelay.test",
    memberName: "苏禾",
    amount: 5_000,
    balanceAfter: 5_000,
    operator: "林静",
    note: "成员月度创作额度",
    date: "2026-07-05 11:28",
    validity: { kind: "until", endsAt: "2026-07-31" },
  },
  {
    id: "AL-20260704-01",
    action: "grant",
    memberAccount: "zhouyu@reelay.test",
    memberName: "周予",
    amount: 7_000,
    balanceAfter: 7_000,
    operator: "Hoo",
    note: "成员月度创作额度",
    date: "2026-07-04 14:10",
    validity: { kind: "permanent" },
  },
];

const memberBalances = new Map(
  CREDIT_ALLOCATION_RECORDS
    .filter((record, index, records) => (
      records.findIndex((candidate) => candidate.memberAccount === record.memberAccount) === index
    ))
    .map((record) => [record.memberAccount, record.balanceAfter]),
);

export function getMemberCreditBalance(member: OrganizationMember): number {
  return member.loginIdentifier
    ? memberBalances.get(member.loginIdentifier) ?? 0
    : 0;
}

export function getLatestMemberCreditRecord(
  member: OrganizationMember,
): CreditAllocationRecord | undefined {
  if (!member.loginIdentifier) return undefined;
  return CREDIT_ALLOCATION_RECORDS.find(
    (record) => record.memberAccount === member.loginIdentifier,
  );
}

export function getMemberCreditUsage(member: OrganizationMember): number {
  if (!member.loginIdentifier) return 0;
  return CREDIT_ALLOCATION_RECORDS.reduce(
    (total, record) => (
      record.memberAccount === member.loginIdentifier && record.action === "consume"
        ? total + Math.abs(record.amount)
        : total
    ),
    0,
  );
}

export function getAllocationTotals() {
  return CREDIT_ALLOCATION_RECORDS.reduce(
    (totals, record) => {
      if (record.action === "grant") totals.granted += record.amount;
      else if (record.action === "reclaim") totals.reclaimed += Math.abs(record.amount);
      else totals.consumed += Math.abs(record.amount);
      return totals;
    },
    { granted: 0, reclaimed: 0, consumed: 0 },
  );
}
