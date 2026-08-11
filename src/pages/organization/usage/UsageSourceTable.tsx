import {
  ChevronRight,
  Image as ImageIcon,
  Play,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  UsageCompositionItem,
  UsageDimension,
  UsageRecord,
} from "../organization-usage-data";
import styles from "./UsageSourceTable.module.css";

type SourceDimension = Exclude<UsageDimension, "type">;

interface UsageSourceTableProps {
  composition: UsageCompositionItem[];
  dimension: SourceDimension;
  records: UsageRecord[];
  onDimensionChange: (dimension: SourceDimension) => void;
  onSelect: (item: UsageCompositionItem) => void;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dimensions: { id: SourceDimension; label: string }[] = [
  { id: "project", label: "按项目" },
  { id: "model", label: "按模型" },
  { id: "member", label: "按成员" },
];

function getRecordDimensionId(record: UsageRecord, dimension: SourceDimension): string {
  if (dimension === "project") return record.projectId;
  if (dimension === "model") return record.modelId;
  return record.memberId;
}

function modelType(records: UsageRecord[], modelId: string): string {
  const kind = records.find((record) => record.modelId === modelId)?.activityKind;
  if (kind === "video") return "视频";
  if (kind === "image") return "图片";
  return "处理";
}

function SourceArt({ dimension }: { dimension: SourceDimension }) {
  if (dimension === "project") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4.5 10A3.5 3.5 0 0 1 8 6.5h5.1l2.5 2.8H24A3.5 3.5 0 0 1 27.5 13v10.5A3.5 3.5 0 0 1 24 27H8a3.5 3.5 0 0 1-3.5-3.5Z" fill="currentColor" fillOpacity=".2" />
        <path d="M4.5 12.2h23v11.3A3.5 3.5 0 0 1 24 27H8a3.5 3.5 0 0 1-3.5-3.5Z" fill="currentColor" />
        <rect x="8.5" y="15.5" width="4.2" height="7.5" rx="1.2" fill="#fff" fillOpacity=".92" />
        <rect x="13.9" y="15.5" width="4.2" height="5" rx="1.2" fill="#fff" fillOpacity=".72" />
        <rect x="19.3" y="15.5" width="4.2" height="6.3" rx="1.2" fill="#fff" fillOpacity=".84" />
        <path d="M8.5 10h7.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }
  if (dimension === "model") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m16 4 11 6.2v12.4L16 29 5 22.6V10.2Z" fill="currentColor" fillOpacity=".18" />
        <path d="m16 4 11 6.2L16 17 5 10.2Z" fill="currentColor" />
        <path d="M16 17v12L5 22.6V10.2Z" fill="currentColor" fillOpacity=".58" />
        <path d="M16 17v12l11-6.4V10.2Z" fill="currentColor" fillOpacity=".78" />
        <path d="m10 8 11 6.4" stroke="#fff" strokeOpacity=".58" strokeWidth="1.3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="11" r="6" fill="currentColor" />
      <path d="M5.5 27c.8-7 4.6-10.5 10.5-10.5S25.7 20 26.5 27Z" fill="currentColor" fillOpacity=".72" />
      <circle cx="16" cy="11" r="3" fill="#fff" fillOpacity=".16" />
    </svg>
  );
}

function SourceIdentity({ item, dimension }: { item: UsageCompositionItem; dimension: SourceDimension }) {
  return (
    <span className={styles.identity}>
      <i aria-hidden="true"><SourceArt dimension={dimension} /></i>
      <span>
        <strong>{item.label}</strong>
        {dimension === "member" ? <small>{item.detail}</small> : null}
      </span>
    </span>
  );
}

export function UsageSourceTable({
  composition,
  dimension,
  records,
  onDimensionChange,
  onSelect,
}: UsageSourceTableProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return composition;
    return composition.filter((item) =>
      `${item.label} ${item.detail}`.toLocaleLowerCase("zh-CN").includes(normalized)
    );
  }, [composition, query]);

  return (
    <section className={styles.panel} aria-labelledby="usage-source-title">
      <header className={styles.header}>
        <h3 id="usage-source-title">消耗来源</h3>
        <div className={styles.actions}>
          {searchOpen ? (
            <label className={styles.searchField}>
              <Search aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={query}
                placeholder="搜索"
                aria-label="搜索消耗来源"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className={styles.searchButton}
            aria-label={searchOpen ? "收起搜索" : "搜索消耗来源"}
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              if (searchOpen) setQuery("");
            }}
          >
            <Search aria-hidden="true" />
          </button>
          <div className={styles.tabs} aria-label="消耗来源维度">
            {dimensions.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={dimension === item.id}
                onClick={() => {
                  setQuery("");
                  onDimensionChange(item.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.table} data-dimension={dimension}>
        <div className={styles.tableHeader}>
          <span>{dimension === "project" ? "项目" : dimension === "model" ? "模型" : "成员"}</span>
          {dimension === "model" ? <span>类型</span> : null}
          <span>消耗积分</span>
          <span>占比</span>
          <span>{dimension === "model" ? "调用次数" : "任务量"}</span>
          {dimension === "model" ? <span>单次平均消耗</span> : null}
          <span aria-hidden="true" />
        </div>
        {filtered.map((item) => {
          const itemRecords = records.filter((record) => getRecordDimensionId(record, dimension) === item.id);
          const processingTasks = itemRecords.filter((record) =>
            record.status === "settled"
            && (record.activityKind === "enhancement" || record.activityKind === "agent")
          ).length;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.row}
              aria-label={`查看${item.label}用量详情`}
              onClick={() => onSelect(item)}
            >
              <SourceIdentity item={item} dimension={dimension} />
              {dimension === "model" ? (
                <span><em data-kind={modelType(records, item.id)}>{modelType(records, item.id)}</em></span>
              ) : null}
              <span className={styles.creditsCell}>
                <strong className={styles.credits}>{numberFormatter.format(item.credits)}</strong>
              </span>
              <span className={styles.share} data-compact={dimension === "project" || undefined}>
                <i aria-hidden="true"><b style={{ width: `${Math.max(3, item.share * 100)}%` }} /></i>
                <strong>{percentFormatter.format(item.share)}</strong>
              </span>
              {dimension === "model" ? (
                <span className={styles.metric}>{numberFormatter.format(item.tasks)}</span>
              ) : (
                <span className={styles.outputScale} data-project="true">
                  <em data-kind="video"><Play /><span>视频</span><strong>{numberFormatter.format(item.videoSeconds)}</strong><small>s</small></em>
                  <em data-kind="image"><ImageIcon /><span>图片</span><strong>{numberFormatter.format(item.imageCount)}</strong><small>张</small></em>
                  <em data-kind="processing"><SlidersHorizontal /><span>媒体处理</span><strong>{numberFormatter.format(processingTasks)}</strong><small>次</small></em>
                </span>
              )}
              {dimension === "model" ? (
                <span className={styles.metric}>{item.tasks > 0 ? (item.credits / item.tasks).toFixed(2) : "—"}</span>
              ) : null}
              <ChevronRight className={styles.chevron} aria-hidden="true" />
            </button>
          );
        })}
        {filtered.length === 0 ? <p className={styles.empty}>没有匹配的消耗来源</p> : null}
      </div>
    </section>
  );
}
