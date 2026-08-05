import {
  Box,
  ChevronRight,
  FolderKanban,
  Image as ImageIcon,
  Play,
  Search,
  SlidersHorizontal,
  UserRound,
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

function SourceIdentity({ item, dimension }: { item: UsageCompositionItem; dimension: SourceDimension }) {
  return (
    <span className={styles.identity}>
      <i aria-hidden="true">
        {dimension === "project" ? <FolderKanban /> : dimension === "model" ? <Box /> : <UserRound />}
      </i>
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
          <span>{dimension === "model" ? "调用次数" : dimension === "project" ? "产出规模" : "任务数"}</span>
          {dimension === "model" ? <span>单次平均消耗</span> : dimension === "member" ? <span>产出规模</span> : null}
          <span aria-hidden="true" />
        </div>
        {filtered.map((item) => {
          const itemRecords = records.filter((record) => getRecordDimensionId(record, dimension) === item.id);
          const processingTasks = itemRecords.filter((record) =>
            record.activityKind === "enhancement" || record.activityKind === "agent"
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
              <strong className={styles.credits}>{numberFormatter.format(item.credits)}</strong>
              <span className={styles.share}>
                <i aria-hidden="true"><b style={{ width: `${Math.max(3, item.share * 100)}%` }} /></i>
                <strong>{percentFormatter.format(item.share)}</strong>
              </span>
              {dimension === "model" ? (
                <span className={styles.metric}>{numberFormatter.format(item.tasks)}</span>
              ) : dimension === "project" ? (
                <span className={styles.outputScale}>
                  {item.videoSeconds > 0 ? <em><Play />视频 {numberFormatter.format(item.videoSeconds)}s</em> : null}
                  {item.imageCount > 0 ? <em><ImageIcon />图片 {numberFormatter.format(item.imageCount)}张</em> : null}
                  {processingTasks > 0 ? <em><SlidersHorizontal />处理 {numberFormatter.format(processingTasks)}次</em> : null}
                </span>
              ) : (
                <span className={styles.metric}>{numberFormatter.format(item.tasks)}</span>
              )}
              {dimension === "model" ? (
                <span className={styles.metric}>{item.tasks > 0 ? (item.credits / item.tasks).toFixed(2) : "—"}</span>
              ) : dimension === "member" ? (
                <span className={styles.outputScale}>
                  {item.videoSeconds > 0 ? <em><Play />{numberFormatter.format(item.videoSeconds)}s</em> : null}
                  {item.imageCount > 0 ? <em><ImageIcon />{numberFormatter.format(item.imageCount)}张</em> : null}
                </span>
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
