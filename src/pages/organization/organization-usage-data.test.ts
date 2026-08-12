import { describe, expect, it } from "vitest";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  buildUsageCsv,
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  formatUsageDateInput,
  getComparisonRange,
  getHeatmapDays,
  getUsageComposition,
  getUsageRange,
  getUsageSummary,
  getWeeklyActivity,
  type UsageRecord,
} from "./organization-usage-data";
import { buildUsageTimeline, chooseTimelineGranularity } from "./usage/usage-analytics";

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
    const weekRecords = filterUsageRecords(demo.records, getUsageRange("rolling7", now));
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

  it("keeps recent demo days within a believable studio usage range", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const range = getUsageRange("rolling30", now);
    const timeline = buildUsageTimeline(filterUsageRecords(demo.records, range), range, "day");
    const saturdayTotals: number[] = [];

    timeline.forEach((point) => {
      const weekday = new Date(`${point.key}T12:00:00+08:00`).getDay();
      if (weekday === 6) {
        saturdayTotals.push(point.total);
        expect(point.total === 0 || point.total >= 2_800).toBe(true);
        expect(point.total).toBeLessThanOrEqual(5_200);
        return;
      }
      if (weekday === 0) {
        expect(point.total).toBeGreaterThanOrEqual(5_200);
        expect(point.total).toBeLessThanOrEqual(6_400);
        return;
      }
      expect(point.total).toBeGreaterThanOrEqual(6_500);
      expect(point.total).toBeLessThanOrEqual(9_700);
    });

    expect(saturdayTotals.some((total) => total > 0)).toBe(true);
  });

  it("uses the documented natural-day ranges and comparison periods", () => {
    const today = getUsageRange("today", now);
    const rolling7 = getUsageRange("rolling7", now);
    const rolling30 = getUsageRange("rolling30", now);
    const month = getUsageRange("month", now);
    const previousMonth = getUsageRange("previousMonth", now);
    const custom = getUsageRange("custom", now, "2026-07-05", "2026-07-12");
    const historyStart = new Date("2024-03-14T18:20:00+08:00");
    const all = getUsageRange("all", now, undefined, undefined, historyStart);

    expect(today.start.toISOString()).toBe("2026-07-26T16:00:00.000Z");
    expect(formatUsageDateInput(rolling7.start)).toBe("2026-07-21");
    expect(formatUsageDateInput(rolling30.start)).toBe("2026-06-28");
    expect(formatUsageDateInput(month.start)).toBe("2026-07-01");
    expect([
      formatUsageDateInput(previousMonth.start),
      formatUsageDateInput(previousMonth.end),
    ]).toEqual(["2026-06-01", "2026-07-01"]);
    expect([
      formatUsageDateInput(custom.start),
      formatUsageDateInput(custom.end),
    ]).toEqual(["2026-07-05", "2026-07-13"]);
    expect(all.start.toISOString()).toBe("2024-03-13T16:00:00.000Z");

    const todayComparison = getComparisonRange("today", today);
    const rolling7Comparison = getComparisonRange("rolling7", rolling7);
    const rolling30Comparison = getComparisonRange("rolling30", rolling30);
    const monthComparison = getComparisonRange("month", month);
    const previousMonthComparison = getComparisonRange("previousMonth", previousMonth);
    const customComparison = getComparisonRange("custom", custom);

    expect(todayComparison?.start.toISOString()).toBe("2026-07-25T16:00:00.000Z");
    expect(todayComparison?.end.toISOString()).toBe("2026-07-26T04:00:00.000Z");
    expect(rolling7Comparison?.start.toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(rolling7Comparison?.end.toISOString()).toBe("2026-07-20T04:00:00.000Z");
    expect(rolling30Comparison?.start.toISOString()).toBe("2026-05-28T16:00:00.000Z");
    expect(rolling30Comparison?.end.toISOString()).toBe("2026-06-27T04:00:00.000Z");
    expect(monthComparison?.start.toISOString()).toBe("2026-05-31T16:00:00.000Z");
    expect(monthComparison?.end.toISOString()).toBe("2026-06-27T04:00:00.000Z");
    expect(previousMonthComparison?.start.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(previousMonthComparison?.end.toISOString()).toBe("2026-05-31T16:00:00.000Z");
    expect(customComparison?.end.getTime()).toBe(custom.start.getTime());
    expect(customComparison!.end.getTime() - customComparison!.start.getTime()).toBe(
      custom.end.getTime() - custom.start.getTime(),
    );
  });

  it("includes both selected custom dates while excluding the next day", () => {
    const createRecord = (id: string, occurredAt: string): UsageRecord => ({
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
      credits: 10,
      outputImages: 1,
      outputVideoSeconds: 0,
      status: "settled",
    });
    const range = getUsageRange(
      "custom",
      new Date("2026-07-27T12:00:00+08:00"),
      "2026-07-05",
      "2026-07-12",
    );
    const records = [
      createRecord("start", "2026-07-05T00:00:00+08:00"),
      createRecord("end", "2026-07-12T23:59:59+08:00"),
      createRecord("next", "2026-07-13T00:00:00+08:00"),
    ];

    expect(filterUsageRecords(records, range).map((record) => record.id)).toEqual([
      "start",
      "end",
    ]);
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
      Math.min(...weekly.map((point) => point.credits)) * 1.1,
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

  it("groups source dimensions with a model-only generation scope", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const records = filterUsageRecords(demo.records, getUsageRange("month", now));
    const total = records.reduce((sum, record) => sum + record.credits, 0);

    for (const dimension of ["member", "project"] as const) {
      const composition = getUsageComposition(records, dimension);
      expect(composition.reduce((sum, item) => sum + item.credits, 0)).toBe(total);
    }

    const modelComposition = getUsageComposition(records, "model");
    const generationCredits = records
      .filter((record) => record.activityKind === "image" || record.activityKind === "video")
      .reduce((sum, record) => sum + record.credits, 0);
    expect(modelComposition.reduce((sum, item) => sum + item.credits, 0))
      .toBe(generationCredits);
    expect(modelComposition.some((item) => item.label === "其他")).toBe(false);
    expect(modelComposition.length).toBeGreaterThan(5);
    expect(
      modelComposition.some((item) => item.label.startsWith("Reelay")),
    ).toBe(false);
  });

  it("adapts custom timeline buckets to the selected date span", () => {
    const rangeFromDays = (days: number) => ({
      start: new Date("2026-01-01T00:00:00+08:00"),
      end: new Date(new Date("2026-01-01T00:00:00+08:00").getTime() + days * 86_400_000),
    });

    expect(chooseTimelineGranularity(rangeFromDays(31))).toBe("day");
    expect(chooseTimelineGranularity(rangeFromDays(32))).toBe("week");
    expect(chooseTimelineGranularity(rangeFromDays(180))).toBe("week");
    expect(chooseTimelineGranularity(rangeFromDays(181))).toBe("month");

    const weeklyTimeline = buildUsageTimeline([], rangeFromDays(98));
    expect(weeklyTimeline.length).toBeGreaterThan(10);
    expect(weeklyTimeline.some((point) => /^\d{2}\/\d{2}–\d{2}$/.test(point.label))).toBe(true);
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
    const report = buildUsageExcelXml(records.slice(0, 2));
    expect(report).toContain('ss:Name="组织用量"');
    expect(report).toContain('ss:Name="每日用量"');
    expect(report).toContain('ss:Name="消耗构成"');
    expect(report).not.toContain('ss:Name="用量明细"');
  });
});
