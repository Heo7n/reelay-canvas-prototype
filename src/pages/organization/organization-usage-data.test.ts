import { describe, expect, it } from "vitest";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  buildUsageCsv,
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  getComparisonRange,
  getUsageBreakdown,
  getUsageRange,
  getUsageSummary,
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
    const breakdown = getUsageBreakdown(currentRecords);

    expect(demo.records.length).toBeGreaterThan(1_000);
    expect(summary.netCredits).toBeGreaterThan(0);
    expect(breakdown.reduce((total, item) => total + item.credits, 0)).toBe(summary.netCredits);
    expect(breakdown.reduce((total, item) => total + item.share, 0)).toBeCloseTo(1, 5);
    expect(summary.estimatedDays).toBe(Math.ceil(demo.availableCredits / summary.dailyAverage));
  });

  it("keeps the fixed 30-day forecast stable when the page range changes", () => {
    const demo = createOrganizationUsageDemoData(members, now);
    const monthRecords = filterUsageRecords(demo.records, getUsageRange("month", now));
    const weekRecords = filterUsageRecords(demo.records, getUsageRange("week", now));
    const monthSummary = getUsageSummary(monthRecords, [], demo.records, now, demo.availableCredits);
    const weekSummary = getUsageSummary(weekRecords, [], demo.records, now, demo.availableCredits);

    expect(monthSummary.dailyAverage).toBe(weekSummary.dailyAverage);
    expect(monthSummary.estimatedDays).toBe(weekSummary.estimatedDays);
    expect(getComparisonRange("all", getUsageRange("all", now))).toBeNull();
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
