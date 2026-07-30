import { X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import {
  getUsageComposition,
  type UsageCompositionItem,
  type UsageDimension,
  type UsageRecord,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface UsageDetailDrawerProps {
  composition: UsageCompositionItem[];
  dimension: UsageDimension;
  item: UsageCompositionItem | null;
  rangeLabel: string;
  records: UsageRecord[];
  onClose: () => void;
}

const dimensionLabels: Record<UsageDimension, string> = {
  type: "类型",
  member: "成员",
  project: "项目",
  model: "模型",
};

interface SpecificationBreakdown {
  id: string;
  label: string;
  credits: number;
  share: number;
  imageCount: number;
  videoSeconds: number;
  tasks: number;
}

interface ModelBreakdown {
  id: string;
  label: string;
  credits: number;
  share: number;
  imageCount: number;
  videoSeconds: number;
  tasks: number;
  specifications: SpecificationBreakdown[];
}

function getDimensionId(record: UsageRecord, dimension: UsageDimension): string {
  if (dimension === "type") return record.activityKind;
  if (dimension === "member") return record.memberId;
  if (dimension === "project") return record.projectId;
  return record.modelId;
}

function filterByCompositionItem(
  records: UsageRecord[],
  composition: UsageCompositionItem[],
  dimension: UsageDimension,
  item: UsageCompositionItem,
): UsageRecord[] {
  if (!composition.some((entry) => entry.id === item.id)) return [];

  return records.filter(
    (record) => getDimensionId(record, dimension) === item.id,
  );
}

function getAggregateSpecification(record: UsageRecord): string {
  const parts = record.specification
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const resolution = parts.find((part) =>
    /^(?:\d+(?:\.\d+)?K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4})$/i.test(part)
  );

  if (record.activityKind === "video") {
    return resolution ?? "默认分辨率";
  }

  if (record.activityKind === "image") {
    if (record.modelId === "gpt-image-2") {
      const quality = parts.find((part) => /^(?:低|中|高|自动)(?:质量)?$/.test(part));
      return [quality, resolution].filter(Boolean).join(" · ") || "默认规格";
    }
    return resolution ?? "默认分辨率";
  }

  if (record.outputVideoSeconds > 0) {
    const stableParts = parts.filter(
      (part) => !/^\d+(?:\.\d+)?\s*(?:s|秒)$/i.test(part),
    );
    return stableParts.join(" · ") || "默认规格";
  }

  return record.specification;
}

function getModelBreakdown(records: UsageRecord[]): ModelBreakdown[] {
  const totalCredits = Math.max(
    0,
    records.reduce((total, record) => total + record.credits, 0),
  );
  const groupedModels = new Map<
    string,
    Omit<ModelBreakdown, "share" | "specifications"> & {
      specificationRecords: UsageRecord[];
    }
  >();

  records.forEach((record) => {
    const current = groupedModels.get(record.modelId) ?? {
      id: record.modelId,
      label: record.modelName,
      credits: 0,
      imageCount: 0,
      videoSeconds: 0,
      tasks: 0,
      specificationRecords: [],
    };
    current.credits += record.credits;
    current.imageCount += record.outputImages;
    current.videoSeconds += record.outputVideoSeconds;
    current.tasks += record.status === "settled" ? 1 : 0;
    current.specificationRecords.push(record);
    groupedModels.set(record.modelId, current);
  });

  return [...groupedModels.values()]
    .map((model) => {
      const groupedSpecifications = new Map<
        string,
        Omit<SpecificationBreakdown, "share">
      >();

      model.specificationRecords.forEach((record) => {
        const aggregateSpecification = getAggregateSpecification(record);
        const specificationId = aggregateSpecification;
        const current = groupedSpecifications.get(specificationId) ?? {
          id: specificationId,
          label: aggregateSpecification,
          credits: 0,
          imageCount: 0,
          videoSeconds: 0,
          tasks: 0,
        };
        current.credits += record.credits;
        current.imageCount += record.outputImages;
        current.videoSeconds += record.outputVideoSeconds;
        current.tasks += record.status === "settled" ? 1 : 0;
        groupedSpecifications.set(specificationId, current);
      });

      const specifications = [...groupedSpecifications.values()]
        .map((specification) => ({
          ...specification,
          credits: Math.max(0, specification.credits),
          share: totalCredits > 0
            ? Math.max(0, specification.credits) / totalCredits
            : 0,
        }))
        .sort((left, right) => right.credits - left.credits);

      return {
        id: model.id,
        label: model.label,
        credits: Math.max(0, model.credits),
        share: totalCredits > 0 ? Math.max(0, model.credits) / totalCredits : 0,
        imageCount: model.imageCount,
        videoSeconds: model.videoSeconds,
        tasks: model.tasks,
        specifications,
      };
    })
    .sort((left, right) => right.credits - left.credits);
}

function formatOutput(item: {
  imageCount: number;
  videoSeconds: number;
  tasks: number;
}): string {
  const output: string[] = [];
  if (item.videoSeconds > 0) {
    output.push(`${item.videoSeconds.toLocaleString("zh-CN")}s`);
  }
  if (item.imageCount > 0) {
    output.push(`${item.imageCount.toLocaleString("zh-CN")} 张`);
  }
  return output.join(" · ") || `${item.tasks.toLocaleString("zh-CN")} 次`;
}

function formatTaskCount(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function SourceRanking({
  items,
  title,
  description,
}: {
  items: UsageCompositionItem[];
  title: string;
  description: string;
}) {
  return (
    <section className={styles.sourceDetailRanking}>
      <header>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div>
        {items.map((entry) => (
          <div key={entry.id} className={styles.sourceDetailRow}>
            <span className={styles.sourceDetailIdentity}>
              <strong>{entry.label}</strong>
              <i aria-hidden="true">
                <span style={{ width: `${Math.max(3, entry.share * 100)}%` }} />
              </i>
            </span>
            <span>{formatOutput(entry)}</span>
            <strong>{entry.credits.toLocaleString("zh-CN")}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function UsageDetailDrawer({
  composition,
  dimension,
  item,
  rangeLabel,
  records,
  onClose,
}: UsageDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const filteredRecords = useMemo(() => {
    if (!item) return [];
    return filterByCompositionItem(records, composition, dimension, item);
  }, [composition, dimension, item, records]);
  const modelBreakdown = useMemo(
    () => getModelBreakdown(filteredRecords),
    [filteredRecords],
  );
  const typeBreakdown = useMemo(
    () => getUsageComposition(filteredRecords, "type"),
    [filteredRecords],
  );
  const memberBreakdown = useMemo(
    () => getUsageComposition(filteredRecords, "member"),
    [filteredRecords],
  );
  const projectBreakdown = useMemo(
    () => getUsageComposition(filteredRecords, "project"),
    [filteredRecords],
  );
  const sourceModelBreakdown = useMemo(
    () => getUsageComposition(filteredRecords, "model"),
    [filteredRecords],
  );
  const activeCredits = Math.max(
    0,
    filteredRecords.reduce((total, record) => total + record.credits, 0),
  );
  const activeTasks = filteredRecords.reduce(
    (total, record) => total + (record.status === "settled" ? 1 : 0),
    0,
  );
  const activeImages = filteredRecords.reduce(
    (total, record) => total + record.outputImages,
    0,
  );
  const activeVideoSeconds = filteredRecords.reduce(
    (total, record) => total + record.outputVideoSeconds,
    0,
  );
  const specificationCount = modelBreakdown.reduce(
    (total, model) => total + model.specifications.length,
    0,
  );
  const relatedCount = dimension === "member"
    ? projectBreakdown.length
    : dimension === "project"
      ? memberBreakdown.length
      : activeTasks;
  const relatedCountLabel = dimension === "member"
    ? "活跃项目"
    : dimension === "project"
      ? "参与成员"
      : "任务数";
  const selectedModel = modelBreakdown[0] ?? null;

  useEffect(() => {
    if (!item) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [item, onClose]);

  if (!item) return null;

  const contextLabel = dimension === "type"
    ? "消耗构成"
    : `消耗来源 · ${dimensionLabels[dimension]}`;
  const identityLabel = item.id === "enhancement" ? "处理工具" : "模型";

  return createPortal(
    <div
      className={styles.usageDrawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className={styles.usageDrawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-detail-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className={styles.usageDrawerHeader}>
          <span>
            <small className={styles.usageDrawerBreadcrumb}>
              <span>{rangeLabel}</span>
              <span aria-hidden="true">/</span>
              <span>{contextLabel}</span>
            </small>
            <div className={styles.usageDrawerTitle}>
              <h2 id="usage-detail-title">{item.label}</h2>
            </div>
            <p>
              {dimension === "type"
                ? "汇总当前时间范围内的产出与积分消耗"
                : "从当前来源查看构成、产出与关联使用情况"}
            </p>
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭消耗明细"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.usageAnalysisContent}>
          <section
            className={styles.usageAnalysisSummary}
            aria-label={`${item.label}用量概览`}
          >
            <article>
              <small>积分消耗</small>
              <strong>{activeCredits.toLocaleString("zh-CN")}</strong>
            </article>
            <article>
              <small>产出</small>
              <strong>
                {formatOutput({
                  imageCount: activeImages,
                  videoSeconds: activeVideoSeconds,
                  tasks: activeTasks,
                })}
              </strong>
            </article>
            <article>
              <small>{relatedCountLabel}</small>
              <strong>{formatTaskCount(relatedCount)}</strong>
            </article>
          </section>

          {dimension === "type" ? (
            <section className={styles.usageAnalysisBreakdown}>
              <header>
                <span>
                  <h3>{identityLabel}用量</h3>
                  <p>按实际计费维度汇总，规格明细已完整展开</p>
                </span>
                <small>
                  {modelBreakdown.length} {identityLabel} · {specificationCount} 规格
                </small>
              </header>

              <div className={styles.usageAnalysisTable}>
                <div
                  className={styles.usageAnalysisTableHeader}
                  aria-hidden="true"
                >
                  <span>{identityLabel} / 计费规格</span>
                  <span>产出</span>
                  <span>积分消耗</span>
                  <span>占比</span>
                </div>
                <div className={styles.usageAnalysisGroups}>
                  {modelBreakdown.map((model) => (
                    <article
                      key={model.id}
                      className={styles.usageAnalysisGroup}
                    >
                      <div className={styles.usageAnalysisModelRow}>
                        <strong>{model.label}</strong>
                        <span>{formatOutput(model)}</span>
                        <span>{model.credits.toLocaleString("zh-CN")}</span>
                        <span>{(model.share * 100).toFixed(1)}%</span>
                      </div>
                      <div className={styles.usageAnalysisSpecRows}>
                        {model.specifications.map((specification) => (
                          <div
                            key={specification.id}
                            className={styles.usageAnalysisSpecRow}
                          >
                            <span>{specification.label}</span>
                            <span>{formatOutput(specification)}</span>
                            <span>
                              {specification.credits.toLocaleString("zh-CN")}
                            </span>
                            <span>
                              {(specification.share * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className={styles.sourceDetailContent}>
              {dimension === "model" && selectedModel ? (
                <section className={styles.sourceSpecificationSection}>
                  <header>
                    <span>
                      <h3>计费规格</h3>
                      <p>仅保留影响费用的规格维度</p>
                    </span>
                    <small>{selectedModel.specifications.length} 项规格</small>
                  </header>
                  <div className={styles.sourceSpecificationTable}>
                    <div aria-hidden="true">
                      <span>规格</span>
                      <span>产出</span>
                      <span>积分消耗</span>
                    </div>
                    {selectedModel.specifications.map((specification) => (
                      <div key={specification.id}>
                        <strong>{specification.label}</strong>
                        <span>{formatOutput(specification)}</span>
                        <span>{specification.credits.toLocaleString("zh-CN")}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <SourceRanking
                  title="消耗构成"
                  description="查看该来源的业务类型分布"
                  items={typeBreakdown}
                />
              )}

              <div className={styles.sourceRelatedGrid}>
                {dimension === "model" ? (
                  <>
                    <SourceRanking
                      title="主要使用成员"
                      description="按积分消耗排序"
                      items={memberBreakdown}
                    />
                    <SourceRanking
                      title="关联项目"
                      description="按项目汇总该模型用量"
                      items={projectBreakdown}
                    />
                  </>
                ) : null}
                {dimension === "member" ? (
                  <>
                    <SourceRanking
                      title="使用模型"
                      description="该成员使用的图片与视频生成模型"
                      items={sourceModelBreakdown}
                    />
                    <SourceRanking
                      title="关联项目"
                      description="该成员参与的项目"
                      items={projectBreakdown}
                    />
                  </>
                ) : null}
                {dimension === "project" ? (
                  <>
                    <SourceRanking
                      title="使用模型"
                      description="项目内使用的图片与视频生成模型"
                      items={sourceModelBreakdown}
                    />
                    <SourceRanking
                      title="参与成员"
                      description="按成员贡献汇总"
                      items={memberBreakdown}
                    />
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
