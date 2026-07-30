import type {
  CreditAllocationRecord,
  CreditIncomeKind,
  CreditIncomeRecord,
} from "./organization-credit-data";

export type CreditLedgerExportKind = "income" | "allocation" | "consumption";

export interface CreditLedgerExportData {
  incomeRecords: CreditIncomeRecord[];
  allocationRecords: CreditAllocationRecord[];
  consumptionRecords: CreditAllocationRecord[];
}

type ExportCell = string | number;

const incomeKindLabels: Record<CreditIncomeKind, string> = {
  purchase: "充值",
  grant: "赠送",
  adjustment: "调整",
};

function escapeCsv(value: ExportCell): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function escapeXml(value: ExportCell): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatValidity(record: CreditAllocationRecord): string {
  const validity = record.validity;
  if (!validity) return "—";
  if (validity.kind === "permanent") return "永久";
  if (validity.kind === "until") return `截至 ${validity.endsAt}`;
  return `${validity.startsAt} 至 ${validity.endsAt}`;
}

function formatOutputSpec(record: CreditAllocationRecord): string {
  const spec = record.generationSpec;
  if (!spec) return "—";
  if (spec.imageCount) return `${spec.imageCount} 张`;
  if (spec.durationSeconds) return `${spec.durationSeconds} 秒`;
  return "—";
}

function getIncomeBalanceMap(records: CreditIncomeRecord[]) {
  let balance = 0;
  return new Map(
    [...records]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((record) => {
        const before = balance;
        balance += record.amount;
        return [record.id, { before, after: balance }] as const;
      }),
  );
}

function getIncomeRows(records: CreditIncomeRecord[]): ExportCell[][] {
  const balances = getIncomeBalanceMap(records);
  return [
    [
      "流水编号",
      "发生时间",
      "入账类型",
      "来源",
      "说明",
      "积分变动",
      "变动前累计积分",
      "变动后累计积分",
    ],
    ...records.map((record) => {
      const balance = balances.get(record.id);
      return [
        record.id,
        record.date,
        incomeKindLabels[record.kind],
        record.source,
        record.description,
        record.amount,
        balance?.before ?? 0,
        balance?.after ?? record.amount,
      ];
    }),
  ];
}

function getAllocationRows(records: CreditAllocationRecord[]): ExportCell[][] {
  return [
    [
      "流水编号",
      "发生时间",
      "成员",
      "账号",
      "类型",
      "积分变动",
      "变动前余额",
      "变动后余额",
      "有效期",
      "操作人",
      "备注",
    ],
    ...records.map((record) => [
      record.id,
      record.date,
      record.memberName,
      record.memberAccount,
      record.action === "grant" ? "发放" : "回收",
      record.amount,
      record.balanceAfter - record.amount,
      record.balanceAfter,
      formatValidity(record),
      record.operator,
      record.note || "—",
    ]),
  ];
}

function getConsumptionRows(records: CreditAllocationRecord[]): ExportCell[][] {
  return [
    [
      "流水编号",
      "发生时间",
      "成员",
      "账号",
      "项目",
      "任务类型",
      "模型",
      "清晰度",
      "画面比例",
      "生成数量或时长",
      "积分变动",
      "扣减前余额",
      "扣减后余额",
    ],
    ...records.map((record) => [
      record.id,
      record.date,
      record.memberName,
      record.memberAccount,
      record.projectName ?? "未命名项目",
      record.taskType ?? "图片生成",
      record.modelName ?? "—",
      record.generationSpec?.resolution ?? "—",
      record.generationSpec?.aspectRatio ?? "—",
      formatOutputSpec(record),
      record.amount,
      record.balanceAfter - record.amount,
      record.balanceAfter,
    ]),
  ];
}

function getRows(kind: CreditLedgerExportKind, data: CreditLedgerExportData): ExportCell[][] {
  if (kind === "income") return getIncomeRows(data.incomeRecords);
  if (kind === "allocation") return getAllocationRows(data.allocationRecords);
  return getConsumptionRows(data.consumptionRecords);
}

function buildWorksheet(name: string, rows: ExportCell[][]): string {
  const body = rows.map((row, rowIndex) => (
    `<Row>${row.map((cell) => {
      const type = typeof cell === "number" ? "Number" : "String";
      const style = rowIndex === 0 ? ' ss:StyleID="Header"' : "";
      return `<Cell${style}><Data ss:Type="${type}">${escapeXml(cell)}</Data></Cell>`;
    }).join("")}</Row>`
  )).join("");
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${body}</Table></Worksheet>`;
}

export function buildCreditLedgerCsv(
  kind: CreditLedgerExportKind,
  data: CreditLedgerExportData,
): string {
  return `\uFEFF${getRows(kind, data)
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n")}`;
}

export function buildCreditLedgerExcelXml(data: CreditLedgerExportData): string {
  const styles = '<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#F0F1F3" ss:Pattern="Solid"/></Style></Styles>';
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${styles}${buildWorksheet("入账记录", getIncomeRows(data.incomeRecords))}${buildWorksheet("分配记录", getAllocationRows(data.allocationRecords))}${buildWorksheet("消耗记录", getConsumptionRows(data.consumptionRecords))}</Workbook>`;
}
