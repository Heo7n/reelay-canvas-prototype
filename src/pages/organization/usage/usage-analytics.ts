import type {
  DateRange,
  UsageActivityKind,
  UsageCompositionItem,
  UsageRecord,
} from "../organization-usage-data";

export type UsageDisplayKind = "video" | "image" | "processing";
export type UsageTimelineGranularity = "day" | "week" | "month";

export interface UsageTimelinePoint {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  tasks: number;
  segments: Record<UsageDisplayKind, number>;
}

export interface UsageTypeViewModel extends UsageCompositionItem {
  id: UsageDisplayKind;
  outputLabel: string;
}

const ORGANIZATION_TIME_ZONE = "Asia/Shanghai";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ORGANIZATION_TIME_ZONE,
});
const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  weekday: "short",
  timeZone: ORGANIZATION_TIME_ZONE,
});
const fullDayFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  timeZone: ORGANIZATION_TIME_ZONE,
});
const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  timeZone: ORGANIZATION_TIME_ZONE,
});

function dayKey(date: Date): string {
  return dayKeyFormatter.format(date);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function displayKind(kind: UsageActivityKind): UsageDisplayKind {
  if (kind === "video") return "video";
  if (kind === "image") return "image";
  return "processing";
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const shifted = new Date(copy.toLocaleString("en-US", { timeZone: ORGANIZATION_TIME_ZONE }));
  const day = shifted.getDay() || 7;
  shifted.setDate(shifted.getDate() - day + 1);
  shifted.setHours(0, 0, 0, 0);
  return shifted;
}

function monthKey(date: Date): string {
  const parts = dayKey(date).split("-");
  return `${parts[0]}-${parts[1]}`;
}

function emptyPoint(key: string, label: string, fullLabel: string): UsageTimelinePoint {
  return {
    key,
    label,
    fullLabel,
    total: 0,
    tasks: 0,
    segments: { video: 0, image: 0, processing: 0 },
  };
}

export function chooseTimelineGranularity(range: DateRange): UsageTimelineGranularity {
  const days = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000));
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

export function buildUsageTimeline(
  records: UsageRecord[],
  range: DateRange,
  granularity = chooseTimelineGranularity(range),
): UsageTimelinePoint[] {
  const points = new Map<string, UsageTimelinePoint>();

  if (granularity === "day") {
    for (let cursor = new Date(range.start); cursor < range.end; cursor = addDays(cursor, 1)) {
      const key = dayKey(cursor);
      points.set(key, emptyPoint(
        key,
        `${key.slice(5)}（${weekdayFormatter.format(cursor)}）`,
        fullDayFormatter.format(cursor),
      ));
    }
  } else if (granularity === "week") {
    for (let cursor = startOfWeek(range.start); cursor < range.end; cursor = addDays(cursor, 7)) {
      const key = dayKey(cursor);
      const end = addDays(cursor, 6);
      const startLabel = key.slice(5).replace("-", "/");
      const endKey = dayKey(end);
      const endLabel = key.slice(5, 7) === endKey.slice(5, 7)
        ? endKey.slice(8)
        : endKey.slice(5).replace("-", "/");
      points.set(key, emptyPoint(
        key,
        `${startLabel}–${endLabel}`,
        `${fullDayFormatter.format(cursor)} 至 ${fullDayFormatter.format(end)}`,
      ));
    }
  } else {
    const start = new Date(range.start);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    for (let cursor = start; cursor < range.end;) {
      const key = monthKey(cursor);
      points.set(key, emptyPoint(key, monthFormatter.format(cursor), monthFormatter.format(cursor)));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  records.forEach((record) => {
    const date = new Date(record.occurredAt);
    let key = dayKey(date);
    if (granularity === "week") key = dayKey(startOfWeek(date));
    if (granularity === "month") key = monthKey(date);
    const point = points.get(key);
    if (!point) return;
    const credits = Math.max(0, record.credits);
    const kind = displayKind(record.activityKind);
    point.total += credits;
    point.segments[kind] += credits;
    if (record.status === "settled") point.tasks += 1;
  });

  return [...points.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function buildUsageTypeViewModels(records: UsageRecord[]): UsageTypeViewModel[] {
  const groups: Record<UsageDisplayKind, UsageTypeViewModel> = {
    video: {
      id: "video",
      label: "视频生成",
      detail: "视频生成与延展",
      credits: 0,
      share: 0,
      imageCount: 0,
      videoSeconds: 0,
      tasks: 0,
      outputLabel: "输出时长",
    },
    image: {
      id: "image",
      label: "图片生成",
      detail: "图片生成与编辑",
      credits: 0,
      share: 0,
      imageCount: 0,
      videoSeconds: 0,
      tasks: 0,
      outputLabel: "输出数量",
    },
    processing: {
      id: "processing",
      label: "媒体处理",
      detail: "高清化、补帧与智能处理",
      credits: 0,
      share: 0,
      imageCount: 0,
      videoSeconds: 0,
      tasks: 0,
      outputLabel: "输出次数",
    },
  };

  records.forEach((record) => {
    const group = groups[displayKind(record.activityKind)];
    group.credits += Math.max(0, record.credits);
    group.imageCount += record.outputImages;
    group.videoSeconds += record.outputVideoSeconds;
    if (record.status === "settled") group.tasks += 1;
  });
  const total = Object.values(groups).reduce((sum, item) => sum + item.credits, 0);
  return [groups.video, groups.image, groups.processing].map((item) => ({
    ...item,
    share: total > 0 ? item.credits / total : 0,
  }));
}

export function typeOutputValue(item: UsageTypeViewModel): number {
  if (item.id === "video") return item.videoSeconds;
  if (item.id === "image") return item.imageCount;
  return item.tasks;
}
