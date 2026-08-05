import { ArrowUpRight, CalendarRange, ChevronLeft, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  getUsageComposition,
  type UsageCompositionItem,
  type UsageDimension,
  type UsageRecord,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface UsageDetailDrawerProps {
  allRecords: UsageRecord[];
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
  identityLabel,
}: {
  items: UsageCompositionItem[];
  identityLabel: string;
}) {
  return (
    <div className={styles.sourceDetailRanking}>
      <div className={styles.sourceDetailTableHeader} aria-hidden="true">
        <span>{identityLabel}</span>
        <span>占比</span>
        <span>积分</span>
      </div>
      {items.length > 0 ? (
        <div>
          {items.map((entry) => (
            <div key={entry.id} className={styles.sourceDetailRow}>
              <span className={styles.sourceDetailIdentity}>
                <strong>{entry.label}</strong>
                <i aria-hidden="true">
                  <span style={{ width: `${Math.max(3, entry.share * 100)}%` }} />
                </i>
              </span>
              <span>{(entry.share * 100).toFixed(1)}%</span>
              <strong>{entry.credits.toLocaleString("zh-CN")}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.sourceDetailEmpty}>当前范围内暂无关联数据</p>
      )}
    </div>
  );
}

export function UsageDetailDrawer({
  allRecords,
  composition,
  dimension,
  item,
  rangeLabel,
  records,
  onClose,
}: UsageDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [relatedDimension, setRelatedDimension] =
    useState<"member" | "project" | "model">("member");
  const [projectScope, setProjectScope] =
    useState<"period" | "lifecycle">("period");
  const analysisRecords = dimension === "project" && projectScope === "lifecycle"
    ? allRecords
    : records;
  const analysisComposition = useMemo(
    () => dimension === "project" && projectScope === "lifecycle"
      ? getUsageComposition(allRecords, "project")
      : composition,
    [allRecords, composition, dimension, projectScope],
  );
  const filteredRecords = useMemo(() => {
    if (!item) return [];
    return filterByCompositionItem(
      analysisRecords,
      analysisComposition,
      dimension,
      item,
    );
  }, [analysisComposition, analysisRecords, dimension, item]);
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
  const relatedCount = dimension === "model"
    ? specificationCount
    : dimension === "member"
      ? projectBreakdown.length
      : dimension === "project"
        ? memberBreakdown.length
        : activeTasks;
  const relatedCountLabel = dimension === "model"
    ? "计费规格"
    : dimension === "member"
      ? "活跃项目"
      : dimension === "project"
        ? "参与成员"
        : "任务数";
  const relatedCountSuffix = dimension === "model"
    ? "项"
    : dimension === "member"
      ? "个"
      : dimension === "project"
        ? "位"
        : "次";
  const selectedModel = modelBreakdown[0] ?? null;
  const relatedOptions = dimension === "model"
    ? [
        {
          id: "member" as const,
          label: "使用成员",
          items: memberBreakdown,
          description: "按成员积分消耗排序",
        },
        {
          id: "project" as const,
          label: "关联项目",
          items: projectBreakdown,
          description: "查看该模型主要用于哪些项目",
        },
      ]
    : dimension === "member"
      ? [
          {
            id: "model" as const,
            label: "使用模型",
            items: sourceModelBreakdown,
            description: "该成员使用的图片与视频生成模型",
          },
          {
            id: "project" as const,
            label: "关联项目",
            items: projectBreakdown,
            description: "查看该成员参与的项目",
          },
        ]
      : dimension === "project"
        ? [
            {
              id: "model" as const,
              label: "使用模型",
              items: sourceModelBreakdown,
              description: "项目内使用的图片与视频生成模型",
            },
            {
              id: "member" as const,
              label: "参与成员",
              items: memberBreakdown,
              description: "查看项目内的成员使用分布",
            },
          ]
        : [];
  const activeRelatedOption = relatedOptions.find(
    (option) => option.id === relatedDimension,
  ) ?? relatedOptions[0];

  useEffect(() => {
    setProjectScope("period");
    if (dimension === "model") setRelatedDimension("member");
    if (dimension === "member" || dimension === "project") {
      setRelatedDimension("model");
    }
  }, [dimension, item?.id]);

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
  const relatedSectionTitle = dimension === "model" ? "使用分布" : "归因分布";

  return createPortal(
    <div
      className={styles.usageDrawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className={`${styles.usageDrawer} ${
          dimension === "type"
            ? styles.compositionUsageDrawer
            : styles.sourceUsageDrawer
        }`}
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
          <span className={styles.usageDrawerHeading}>
            <small className={styles.usageDrawerBreadcrumb}>
              {dimension !== "project" ? (
                <>
                  <span>{rangeLabel}</span>
                  <span aria-hidden="true">/</span>
                </>
              ) : null}
              <span>{contextLabel}</span>
            </small>
            <div className={styles.usageDrawerTitle}>
              <h2 id="usage-detail-title">
                {dimension === "type" ? item.label : `${item.label} 用量`}
              </h2>
            </div>
            {dimension === "project" ? (
              <div className={styles.projectScopeRow}>
                <span className={styles.projectRangeLabel}>
                  <CalendarRange aria-hidden="true" />
                  <span>统计范围</span>
                  <strong>
                    {projectScope === "lifecycle" ? "项目全周期" : rangeLabel}
                  </strong>
                </span>
                <button
                  type="button"
                  className={styles.projectLifecycleAction}
                  onClick={() =>
                    setProjectScope((current) =>
                      current === "period" ? "lifecycle" : "period"
                    )}
                >
                  {projectScope === "period" ? (
                    <>
                      项目全周期
                      <ArrowUpRight aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <ChevronLeft aria-hidden="true" />
                      返回期间统计
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.usageDrawerCloseButton}
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
            <article className={styles.usageSummaryPrimary}>
              <small>积分消耗</small>
              <strong>{activeCredits.toLocaleString("zh-CN")}</strong>
            </article>
            <article className={styles.usageSummaryOutput}>
              <small>产出</small>
              <strong>
                {formatOutput({
                  imageCount: activeImages,
                  videoSeconds: activeVideoSeconds,
                  tasks: activeTasks,
                })}
              </strong>
            </article>
            <article className={styles.usageSummaryContext}>
              <small>{relatedCountLabel}</small>
              <strong>
                {formatTaskCount(relatedCount)}
                <span>{relatedCountSuffix}</span>
              </strong>
            </article>
          </section>

          {dimension === "type" ? (
            <section className={styles.usageAnalysisBreakdown}>
              <header>
                <span>
                  <h3>计费结构</h3>
                  <p>按{identityLabel}展开影响扣费的规格，不重复呈现任务流水</p>
                </span>
                <small>
                  {modelBreakdown.length} 个{identityLabel} · {specificationCount} 项规格
                </small>
              </header>

              <div className={styles.usageAnalysisTable}>
                <div
                  className={styles.usageAnalysisTableHeader}
                  aria-hidden="true"
                >
                  <span>{identityLabel} / 计费规格</span>
                  <span>任务数量</span>
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
                        <span>{model.tasks.toLocaleString("zh-CN")} 次</span>
                        <span className={styles.usageAnalysisOutputValue}>
                          {formatOutput(model)}
                        </span>
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
                            <span>
                              {specification.tasks.toLocaleString("zh-CN")} 次
                            </span>
                            <span className={styles.usageAnalysisOutputValue}>
                              {formatOutput(specification)}
                            </span>
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
                      <p>仅保留影响扣费的参数维度，产出为所选期间累计值</p>
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
                <section className={styles.sourceCompositionSection}>
                  <header>
                    <span>
                      <h3>消耗构成</h3>
                      <p>
                        {dimension === "member"
                          ? "该成员在所选期间把积分用于哪些能力"
                          : projectScope === "lifecycle"
                            ? "该项目全周期的能力消费结构"
                            : "该项目在当前期间的能力消费结构"}
                      </p>
                    </span>
                  </header>
                  <SourceRanking items={typeBreakdown} identityLabel="类型" />
                </section>
              )}

              {activeRelatedOption ? (
                <section className={styles.sourceRelatedSection}>
                  <header>
                    <span>
                      <h3>{relatedSectionTitle}</h3>
                      <p>{activeRelatedOption.description}</p>
                    </span>
                    <div
                      className={styles.sourceRelatedTabs}
                      aria-label={`${relatedSectionTitle}维度`}
                    >
                      {relatedOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={option.id === activeRelatedOption.id
                            ? styles.activeSourceRelatedTab
                            : ""}
                          aria-pressed={option.id === activeRelatedOption.id}
                          onClick={() => setRelatedDimension(option.id)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </header>
                  <SourceRanking
                    items={activeRelatedOption.items}
                    identityLabel={activeRelatedOption.label}
                  />
                </section>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
