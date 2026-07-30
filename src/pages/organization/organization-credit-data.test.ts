import { describe, expect, it } from "vitest";

import {
  CREDIT_ALLOCATION_RECORDS,
  CREDIT_INCOME_RECORDS,
  getAllocationTotals,
  ORGANIZATION_CREDIT_SUMMARY,
} from "./organization-credit-data";

describe("organization credit demo ledger", () => {
  it("keeps current organization balances reconcilable", () => {
    expect(ORGANIZATION_CREDIT_SUMMARY.available).toBe(
      ORGANIZATION_CREDIT_SUMMARY.allocated + ORGANIZATION_CREDIT_SUMMARY.unallocated,
    );
    expect(ORGANIZATION_CREDIT_SUMMARY.available).toBe(
      ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome - ORGANIZATION_CREDIT_SUMMARY.consumed,
    );
  });

  it("reconciles income records with lifetime credited points", () => {
    expect(
      CREDIT_INCOME_RECORDS.reduce((total, record) => total + record.amount, 0),
    ).toBe(ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome);
  });

  it("reconciles allocation records with current member balances", () => {
    const currentBalances = new Map<string, number>();
    for (const record of CREDIT_ALLOCATION_RECORDS) {
      if (!currentBalances.has(record.memberAccount)) {
        currentBalances.set(record.memberAccount, record.balanceAfter);
      }
    }

    expect([...currentBalances.values()].reduce((total, balance) => total + balance, 0)).toBe(
      ORGANIZATION_CREDIT_SUMMARY.allocated,
    );

    const totals = getAllocationTotals();
    expect(totals.consumed).toBeGreaterThan(0);
    expect(totals.granted - totals.reclaimed - totals.consumed).toBe(
      ORGANIZATION_CREDIT_SUMMARY.allocated,
    );
  });

  it("keeps task consumption rows auditable without relying on balance copy", () => {
    const consumptionRecords = CREDIT_ALLOCATION_RECORDS.filter(
      (record) => record.action === "consume",
    );

    expect(consumptionRecords.length).toBeGreaterThan(0);
    for (const record of consumptionRecords) {
      expect(record.projectName).toBeTruthy();
      expect(record.taskType).toBeTruthy();
      expect(record.modelName).toBeTruthy();
      expect(record.generationSpec?.resolution).toBeTruthy();
      expect(record.generationSpec?.aspectRatio).toMatch(/^\d+:\d+$/);
      expect(
        Boolean(record.generationSpec?.imageCount)
        || Boolean(record.generationSpec?.durationSeconds),
      ).toBe(true);
    }
    expect(consumptionRecords.some((record) => record.generationSpec?.resolution === "4K")).toBe(
      true,
    );
  });
});
