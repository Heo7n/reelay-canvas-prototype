import { describe, expect, it } from "vitest";

import {
  CREDIT_ALLOCATION_RECORDS,
  CREDIT_INCOME_RECORDS,
} from "./organization-credit-data";
import {
  buildCreditLedgerCsv,
  buildCreditLedgerExcelXml,
  type CreditLedgerExportData,
} from "./organization-credit-export";

const exportData: CreditLedgerExportData = {
  incomeRecords: CREDIT_INCOME_RECORDS,
  allocationRecords: CREDIT_ALLOCATION_RECORDS.filter(
    (record) => record.action !== "consume",
  ),
  consumptionRecords: CREDIT_ALLOCATION_RECORDS.filter(
    (record) => record.action === "consume",
  ),
};

describe("organization credit ledger exports", () => {
  it("exports the visible ledger kind as analysis-friendly CSV", () => {
    const allocationCsv = buildCreditLedgerCsv("allocation", exportData);
    const consumptionCsv = buildCreditLedgerCsv("consumption", exportData);

    expect(allocationCsv).toContain("流水编号,发生时间,成员,账号,类型,积分变动");
    expect(allocationCsv).toContain("2026-07-25 至 2026-08-24");
    expect(consumptionCsv).toContain("任务类型,模型,清晰度,画面比例");
    expect(consumptionCsv).toContain("Seedream 5.0 Pro,4K,9:16,2 张");
    expect(consumptionCsv).toContain("扣减前余额,扣减后余额");
  });

  it("exports the organization ledger as a three-sheet Excel workbook", () => {
    const workbook = buildCreditLedgerExcelXml(exportData);

    expect(workbook).toContain('ss:Name="入账记录"');
    expect(workbook).toContain('ss:Name="分配记录"');
    expect(workbook).toContain('ss:Name="消耗记录"');
    expect(workbook).toContain("IN-20260720-01");
    expect(workbook).toContain("US-20260725-02");
  });
});
