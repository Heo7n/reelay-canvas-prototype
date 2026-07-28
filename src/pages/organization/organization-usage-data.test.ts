import { describe, expect, it } from "vitest";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  buildUsageCsv,
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  getComparisonRange,
  getHeatmapDays,
  getUsageComposition,
  getUsageRange,
  getUsageSummary,
  getWeeklyActivity,
  type UsageRecord,
} from "./organization-usage-data";

const members: OrganizationMember[] = [
  {
    userId: "actor-owner",
    displayName: "Hoo",
    loginIdentifier: "creator@reelay.test",
    role: "owner",
  },
  {
    userId: "actor-linjing",
    displayName: "林静",
    loginIdentifier: "linjing@reelay.test",
    role: "admin",
  },
];

const now = new Date("2026-07-27T12:00:00+08:00");

describe("organization usage demo data", () => {
  it("keeps summary and breakdown totals internally consistent", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const range = getUsageRange("month", now);
    const previousRange = getComparisonRange("month", range);
    const currentRecords = filterUsageRecords(demo.records, range);
    const previousRecords = previousRange
      ? filterUsageRecords(demo.records, previousRange)
      : [];
    const summary = getUsageSummary(
      currentRecords,
      previousRecords,
      demo.records,
      now,
      demo.availableCredits,
    );
    const composition = getUsageComposition(currentRecords, "type");

    expect(demo.records.length).toBeGreaterThan(1_000);
    expect(summary.netCredits).toBeGreaterThan(0);
    expect(composition.reduce((total, item) => total + item.credits, 0)).toBe(summary.netCredits);
    expect(composition.reduce((total, item) => total + item.share, 0)).toBeCloseTo(1, 5);
    expect(summary.estimatedDaysRecent).toBe(
      Math.floor(demo.availableCredits / summary.recentDailyAverage),
    );
    expect(summary.recentToLifetimeRate).not.toBeNull();
  });

  it("keeps the organization forecast stable when the page range changes", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const monthRecords = filterUsageRecords(demo.records, getUsageRange("month", now));
    const weekRecords = filterUsageRecords(demo.records, getUsageRange("week", now));
    const todayRecords = filterUsageRecords(demo.records, getUsageRange("today", now));
    const monthSummary = getUsageSummary(monthRecords, [], demo.records, now, demo.availableCredits);
    const weekSummary = getUsageSummary(weekRecords, [], demo.records, now, demo.availableCredits);

    expect(weekRecords.length).toBeGreaterThan(todayRecords.length);
    expect(weekSummary.netCredits).toBeGreaterThan(
      getUsageSummary(todayRecords, [], demo.records, now, demo.availableCredits).netCredits,
    );
    expect(monthSummary.recentDailyAverage).toBe(weekSummary.recentDailyAverage);
    expect(monthSummary.estimatedDaysRecent).toBe(weekSummary.estimatedDaysRecent);
    expect(monthSummary.lifetimeDailyAverage).toBe(weekSummary.lifetimeDailyAverage);
    expect(monthSummary.recentToLifetimeRate).toBe(weekSummary.recentToLifetimeRate);
    expect(getComparisonRange("all", getUsageRange("all", now))).toBeNull();
  });

  it("keeps zero-use calendar days in the recent trend forecast", () => {
    const createRecord = (id: string, occurredAt: string, credits: number): UsageRecord => ({
      id,
      occurredAt,
      memberId: "actor-owner",
      memberName: "Hoo",
      memberAccount: "creator@reelay.test",
      projectId: "project-1",
      projectName: "测试项目",
      activityKind: "image",
      activityLabel: "图片生成",
      modelId: "model-1",
      modelName: "GPT Image 2",
      specification: "1K",
      credits,
      outputImages: 1,
      outputVideoSeconds: 0,
      status: "settled",
    });
    const sparseRecords = [
      createRecord("recent", now.toISOString(), 300),
      createRecord("oldest", new Date("2026-06-28T12:00:00+08:00").toISOString(), 1),
    ];
    const summary = getUsageSummary(
      sparseRecords,
      [],
      sparseRecords,
      now,
      100_000,
    );

    expect(summary.recentDailyAverage).toBeGreaterThan(0);
    expect(summary.recentDailyAverage).toBeLessThan(100);
    expect(summary.estimatedDaysRecent).toBe(
      Math.floor(100_000 / summary.recentDailyAverage),
    );
  });

  it("builds navigable annual activity views from the same ledger records", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const heatmap = getHeatmapDays(demo.records, now);
    const weekly = getWeeklyActivity(demo.records, now);

    expect(heatmap).toHaveLength(365);
    expect(weekly).toHaveLength(52);
    expect(weekly.at(-1)?.cumulativeCredits).toBeGreaterThan(0);
    expect(new Set(weekly.map((point) => point.credits)).size).toBeGreaterThan(20);
    expect(Math.max(...weekly.map((point) => point.credits))).toBeGreaterThan(
      Math.min(...weekly.map((point) => point.credits)) * 4,
    );
    expect(weekly.every((point, index) => (
      index === 0 || point.cumulativeCredits >= weekly[index - 1].cumulativeCredits
    ))).toBe(true);

    const previousWindow = getHeatmapDays(
      demo.records,
      new Date("2025-07-28T12:00:00+08:00"),
    );
    expect(previousWindow.some((day) => day.credits > 0)).toBe(true);
  });

  it("groups the same period by member, project, and model without changing totals", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const records = filterUsageRecords(demo.records, getUsageRange("month", now));
    const total = records.reduce((sum, record) => sum + record.credits, 0);

    for (const dimension of ["member", "project", "model"] as const) {
      const composition = getUsageComposition(records, dimension);
      expect(composition.reduce((sum, item) => sum + item.credits, 0)).toBe(total);
    }

    expect(getUsageComposition(records, "model").at(-1)?.label).toBe("其他");
    expect(getUsageComposition(records, "model")).toHaveLength(6);
  });

  it("applies ledger filters and produces useful export files", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const records = filterUsageRecords(demo.records, getUsageRange("all", now), {
      memberId: "actor-linjing",
      projectId: "",
      activityKind: "video",
      modelId: "",
    });

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => (
      record.memberId === "actor-linjing" && record.activityKind === "video"
    ))).toBe(true);
    expect(buildUsageCsv(records.slice(0, 2))).toContain("成员,账号,项目");
    expect(buildUsageCsv(records.slice(0, 2))).toContain("林静");
    expect(buildUsageExcelXml(records.slice(0, 2))).toContain('ss:Name="组织用量"');
  });
});
