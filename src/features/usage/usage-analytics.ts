import type {
  DateRange,
  HeatmapDay,
  UsageActivityKind,
  UsageActivityPoint,
  UsageCompositionItem,
  UsageDimension,
  UsageFilters,
  UsageRangePreset,
  UsageRecord,
  UsageSummary,
  UsageTrendPoint,
} from "./usage-types";

const DEMO_HISTORY_DAYS = 1_095;
export const ORGANIZATION_TIME_ZONE = "Asia/Shanghai";
const ORGANIZATION_TIME_ZONE_OFFSET = 8 * 60 * 60 * 1_000;

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

export function usageDateKey(value: Date): string {
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
      const key = `${usageDateKey(date)}-${String(organizationHour).padStart(2, "0")}`;
      return { key, label: hourFormatter.format(date), credits: 0, tasks: 0 };
    }
    if (mode === "day") {
      return { key: usageDateKey(date), label: dayFormatter.format(date), credits: 0, tasks: 0 };
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
    const key = usageDateKey(date);
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
    const key = usageDateKey(date);
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
      key: usageDateKey(pointStart),
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
    const date = usageDateKey(new Date(record.occurredAt));
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
