import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileDown,
  Image,
  ListFilter,
  RotateCcw,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import { UsageHeatmap } from "./UsageHeatmap";
import { UsageTrendChart } from "./UsageTrendChart";
import {
  buildUsageCsv,
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  getComparisonRange,
  getHeatmapDays,
  getUsageBreakdown,
  getUsageRange,
  getUsageRankings,
  getUsageSummary,
  getUsageTrend,
  type UsageActivityKind,
  type UsageDimension,
  type UsageFilters,
  type UsageRangePreset,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface OrganizationUsageSectionProps {
  members: OrganizationMember[];
  workspaceName: string;
}

type UsageView = "overview" | "ledger";

const RANGE_ITEMS: { id: UsageRangePreset; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "all", label: "累计" },
  { id: "custom", label: "自定义" },
];

const DIMENSION_ITEMS: { id: UsageDimension; label: string }[] = [
  { id: "member", label: "成员" },
  { id: "project", label: "项目" },
  { id: "model", label: "模型" },
];

const EMPTY_FILTERS: UsageFilters = {
  memberId: "",
  projectId: "",
  activityKind: "",
  modelId: "",
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function dateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatVideoDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes === 0) return `${remaining}s`;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function formatChange(rate: number | null): string {
  if (rate === null) return "暂无上期数据";
  const percentage = Math.abs(rate * 100).toFixed(1);
  return `较上期 ${rate >= 0 ? "+" : "−"}${percentage}%`;
}

function downloadFile(content: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function OrganizationUsageSection({
  members,
  workspaceName,
}: OrganizationUsageSectionProps) {
  const now = useMemo(() => new Date(), []);
  const demoData = useMemo(() => createOrganizationUsageDemoData(members, now), [members, now]);
  const [view, setView] = useState<UsageView>("overview");
  const [rangePreset, setRangePreset] = useState<UsageRangePreset>("month");
  const [customStart, setCustomStart] = useState(dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(dateInputValue(now));
  const [showComparison, setShowComparison] = useState(true);
  const [dimension, setDimension] = useState<UsageDimension>("member");
  const [filters, setFilters] = useState<UsageFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);

  const range = useMemo(
    () => getUsageRange(rangePreset, now, customStart, customEnd),
    [customEnd, customStart, now, rangePreset],
  );
  const comparisonRange = useMemo(() => getComparisonRange(rangePreset, range), [range, rangePreset]);
  const rangeRecords = useMemo(
    () => filterUsageRecords(demoData.records, range),
    [demoData.records, range],
  );
  const comparisonRecords = useMemo(
    () => comparisonRange ? filterUsageRecords(demoData.records, comparisonRange) : [],
    [comparisonRange, demoData.records],
  );
  const summary = useMemo(
    () => getUsageSummary(
      rangeRecords,
      comparisonRecords,
      demoData.records,
      now,
      demoData.availableCredits,
    ),
    [comparisonRecords, demoData, now, rangeRecords],
  );
  const trend = useMemo(() => getUsageTrend(rangeRecords, range), [range, rangeRecords]);
  const comparisonTrend = useMemo(
    () => comparisonRange ? getUsageTrend(comparisonRecords, comparisonRange) : [],
    [comparisonRange, comparisonRecords],
  );
  const breakdown = useMemo(() => getUsageBreakdown(rangeRecords), [rangeRecords]);
  const rankings = useMemo(() => getUsageRankings(rangeRecords, dimension), [dimension, rangeRecords]);
  const heatmap = useMemo(() => getHeatmapDays(demoData.records, now), [demoData.records, now]);
  const ledgerRecords = useMemo(
    () => filterUsageRecords(demoData.records, range, filters),
    [demoData.records, filters, range],
  );
  const pageSize = 9;
  const pageCount = Math.max(1, Math.ceil(ledgerRecords.length / pageSize));
  const pageRecords = ledgerRecords.slice((page - 1) * pageSize, page * pageSize);

  const filterOptions = useMemo(() => ({
    members: [...new Map(demoData.records.map((record) => [
      record.memberId,
      { id: record.memberId, label: record.memberName },
    ])).values()],
    projects: [...new Map(demoData.records.map((record) => [
      record.projectId,
      { id: record.projectId, label: record.projectName },
    ])).values()],
    models: [...new Map(demoData.records.map((record) => [
      record.modelId,
      { id: record.modelId, label: record.modelName },
    ])).values()],
  }), [demoData.records]);

  useEffect(() => {
    setPage(1);
  }, [filters, rangePreset, customStart, customEnd]);

  useEffect(() => {
    const closeExportMenu = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        exportMenuRef.current?.removeAttribute("open");
      }
    };
    const closeExportMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exportMenuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeExportMenu);
    document.addEventListener("keydown", closeExportMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeExportMenu);
      document.removeEventListener("keydown", closeExportMenuOnEscape);
    };
  }, []);

  const hasFilters = Object.values(filters).some(Boolean);
  const comparisonAvailable = rangePreset !== "all";

  const applyBreakdownFilter = (activityKind: UsageActivityKind) => {
    setFilters({ ...EMPTY_FILTERS, activityKind });
    setView("ledger");
  };

  const applyRankingFilter = (id: string) => {
    if (dimension === "member") setFilters({ ...EMPTY_FILTERS, memberId: id });
    if (dimension === "project") setFilters({ ...EMPTY_FILTERS, projectId: id });
    if (dimension === "model") setFilters({ ...EMPTY_FILTERS, modelId: id });
    setView("ledger");
  };

  const exportRecords = (format: "csv" | "excel") => {
    const stamp = dateInputValue(now);
    if (format === "csv") {
      downloadFile(buildUsageCsv(ledgerRecords), `Reelay-组织用量-${stamp}.csv`, "text/csv;charset=utf-8");
    } else {
      downloadFile(
        buildUsageExcelXml(ledgerRecords),
        `Reelay-组织用量-${stamp}.xls`,
        "application/vnd.ms-excel;charset=utf-8",
      );
    }
    exportMenuRef.current?.removeAttribute("open");
  };

  return (
    <section className={styles.usageSection} aria-labelledby="organization-usage-title">
      <header className={styles.pageHeader}>
        <span>
          <h1 id="organization-usage-title">用量看板</h1>
          <p>了解组织积分消耗、创作产出与成员使用情况。</p>
        </span>
        <span className={styles.dataFreshness}>
          <Clock3 aria-hidden="true" />
          演示数据 · 更新于 5 分钟前
        </span>
      </header>

      <div className={styles.viewNavigation} aria-label="用量看板视图">
        <button
          type="button"
          className={view === "overview" ? styles.activeView : ""}
          aria-pressed={view === "overview"}
          onClick={() => setView("overview")}
        >
          概览
        </button>
        <button
          type="button"
          className={view === "ledger" ? styles.activeView : ""}
          aria-pressed={view === "ledger"}
          onClick={() => setView("ledger")}
        >
          流水明细
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.rangeControl} aria-label="时间范围">
          {RANGE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={rangePreset === item.id ? styles.activeRange : ""}
              aria-pressed={rangePreset === item.id}
              onClick={() => setRangePreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className={styles.toolbarMeta}>
          <span><CalendarDays aria-hidden="true" />Asia/Shanghai</span>
          <details ref={exportMenuRef} className={styles.exportMenu}>
            <summary aria-label="导出当前筛选数据">
              <Download aria-hidden="true" />
              导出
              <ChevronDown aria-hidden="true" />
            </summary>
            <div>
              <button type="button" onClick={() => exportRecords("csv")}>
                <FileDown aria-hidden="true" />
                <span><strong>CSV</strong><small>适合进一步分析</small></span>
              </button>
              <button type="button" onClick={() => exportRecords("excel")}>
                <BarChart3 aria-hidden="true" />
                <span><strong>Excel</strong><small>当前筛选结果</small></span>
              </button>
            </div>
          </details>
        </div>
      </div>

      {rangePreset === "custom" ? (
        <div className={styles.customRange}>
          <label>
            <span>开始日期</span>
            <input
              type="date"
              max={customEnd}
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </label>
          <span aria-hidden="true">至</span>
          <label>
            <span>结束日期</span>
            <input
              type="date"
              min={customStart}
              max={dateInputValue(now)}
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {view === "overview" ? (
        <>
          <div className={styles.metricGrid}>
            <article>
              <span><CircleDollarSign aria-hidden="true" />组织可用积分</span>
              <strong>{numberFormatter.format(demoData.availableCredits)}</strong>
              <small>未分配与成员可用余额之和</small>
            </article>
            <article>
              <span><Sparkles aria-hidden="true" />本期净消耗</span>
              <strong>{numberFormatter.format(summary.netCredits)}</strong>
              <small>{formatChange(summary.changeRate)}</small>
            </article>
            <article>
              <span><Clock3 aria-hidden="true" />预计可用</span>
              <strong>{summary.estimatedDays ? `约 ${Math.min(summary.estimatedDays, 365)} 天` : "暂无预测"}</strong>
              <small>日均 {numberFormatter.format(summary.dailyAverage)} · 按近 30 日估算</small>
            </article>
            <article className={styles.outputMetric}>
              <span><Check aria-hidden="true" />成功产出</span>
              <div>
                <span><Image aria-hidden="true" /><strong>{numberFormatter.format(summary.imageCount)}</strong><small>张图片</small></span>
                <span><Video aria-hidden="true" /><strong>{formatVideoDuration(summary.videoSeconds)}</strong><small>视频时长</small></span>
              </div>
            </article>
          </div>

          <section className={styles.analysisSection} aria-labelledby="usage-trend-title">
            <header className={styles.analysisHeader}>
              <span>
                <h2 id="usage-trend-title">消耗趋势</h2>
                <p>{numberFormatter.format(summary.taskCount)} 个任务 · {summary.activeMembers} 位活跃成员</p>
              </span>
              {comparisonAvailable ? (
                <button
                  type="button"
                  className={styles.compareToggle}
                  aria-pressed={showComparison}
                  onClick={() => setShowComparison((current) => !current)}
                >
                  <i aria-hidden="true" />
                  较上期
                </button>
              ) : null}
            </header>
            <UsageTrendChart
              comparisonPoints={comparisonTrend}
              points={trend}
              showComparison={showComparison && comparisonAvailable}
            />
          </section>

          <div className={styles.analyticsGrid}>
            <section className={styles.analysisSection} aria-labelledby="usage-breakdown-title">
              <header className={styles.analysisHeader}>
                <span>
                  <h2 id="usage-breakdown-title">消耗构成</h2>
                  <p>积分主要花在什么地方</p>
                </span>
              </header>
              <div className={styles.breakdownList}>
                {breakdown.map((item) => (
                  <button key={item.id} type="button" onClick={() => applyBreakdownFilter(item.id)}>
                    <span className={styles.breakdownTitle}>
                      <strong>{item.label}</strong>
                      <span>{numberFormatter.format(item.credits)} 积分</span>
                      <small>{(item.share * 100).toFixed(1)}%</small>
                    </span>
                    <span className={styles.breakdownTrack} aria-hidden="true">
                      <i style={{ width: `${Math.max(2, item.share * 100)}%` }} />
                    </span>
                    <small>
                      {item.id === "video"
                        ? `${formatVideoDuration(item.videoSeconds)} 成功视频`
                        : item.imageCount > 0
                          ? `${numberFormatter.format(item.imageCount)} 张成功图片`
                          : `${numberFormatter.format(item.tasks)} 次处理`}
                    </small>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.analysisSection} aria-labelledby="usage-ranking-title">
              <header className={styles.analysisHeader}>
                <span>
                  <h2 id="usage-ranking-title">消耗排行</h2>
                  <p>点击条目查看对应流水</p>
                </span>
                <div className={styles.dimensionTabs} aria-label="排行维度">
                  {DIMENSION_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={dimension === item.id ? styles.activeDimension : ""}
                      aria-pressed={dimension === item.id}
                      onClick={() => setDimension(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </header>
              <div className={styles.rankingList}>
                {rankings.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => applyRankingFilter(item.id)}>
                    <span className={styles.rankIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.rankIdentity}>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <span className={styles.rankOutput}>
                      <strong>{numberFormatter.format(item.credits)}</strong>
                      <small>{item.imageCount > 0 ? `${item.imageCount} 张` : item.videoSeconds > 0 ? formatVideoDuration(item.videoSeconds) : `${item.tasks} 次`}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className={styles.analysisSection} aria-labelledby="usage-heatmap-title">
            <header className={styles.analysisHeader}>
              <span>
                <h2 id="usage-heatmap-title">年度活跃分布</h2>
                <p>最近 365 天的组织积分消耗强度</p>
              </span>
            </header>
            <UsageHeatmap days={heatmap} />
          </section>
        </>
      ) : (
        <section className={styles.ledgerSection} aria-labelledby="usage-ledger-title">
          <header className={styles.ledgerHeader}>
            <span>
              <h2 id="usage-ledger-title">组织流水明细</h2>
              <p>当前筛选共 {numberFormatter.format(ledgerRecords.length)} 条记录</p>
            </span>
            {hasFilters ? (
              <button type="button" className={styles.clearFilters} onClick={() => setFilters(EMPTY_FILTERS)}>
                <RotateCcw aria-hidden="true" />
                清除筛选
              </button>
            ) : null}
          </header>

          <div className={styles.filterBar}>
            <span><ListFilter aria-hidden="true" />筛选</span>
            <label>
              <span>成员</span>
              <select value={filters.memberId} onChange={(event) => setFilters((current) => ({ ...current, memberId: event.target.value }))}>
                <option value="">全部成员</option>
                {filterOptions.members.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>项目</span>
              <select value={filters.projectId} onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))}>
                <option value="">全部项目</option>
                {filterOptions.projects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>任务类型</span>
              <select value={filters.activityKind} onChange={(event) => setFilters((current) => ({ ...current, activityKind: event.target.value as UsageFilters["activityKind"] }))}>
                <option value="">全部类型</option>
                <option value="image">图片生成</option>
                <option value="video">视频生成</option>
                <option value="enhancement">编辑增强</option>
                <option value="agent">Agent 处理</option>
              </select>
            </label>
            <label>
              <span>模型</span>
              <select value={filters.modelId} onChange={(event) => setFilters((current) => ({ ...current, modelId: event.target.value }))}>
                <option value="">全部模型</option>
                {filterOptions.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.ledgerTable}>
            <div className={styles.ledgerTableHeader} aria-hidden="true">
              <span>时间 / 成员</span>
              <span>项目</span>
              <span>任务 / 模型</span>
              <span>规格与产出</span>
              <span>积分变化</span>
            </div>
            {pageRecords.map((record) => (
              <article key={record.id}>
                <span className={styles.ledgerIdentity}>
                  <strong>{record.memberName}</strong>
                  <small>{dateTimeFormatter.format(new Date(record.occurredAt))}</small>
                </span>
                <span className={styles.ledgerProject}>{record.projectName}</span>
                <span className={styles.ledgerTask}>
                  <strong>{record.activityLabel}</strong>
                  <small>{record.modelName}</small>
                </span>
                <span className={styles.ledgerSpecification}>
                  <strong>{record.specification}</strong>
                  <small>
                    {record.outputImages > 0
                      ? `${record.outputImages} 张`
                      : record.outputVideoSeconds > 0
                        ? formatVideoDuration(record.outputVideoSeconds)
                        : "1 次"}
                  </small>
                </span>
                <span className={record.credits < 0 ? styles.creditRefund : styles.creditDebit}>
                  <strong>{record.credits < 0 ? "+" : "−"}{numberFormatter.format(Math.abs(record.credits))}</strong>
                  <small>{record.status === "refunded" ? "已退款" : "已结算"}</small>
                </span>
              </article>
            ))}
          </div>

          <footer className={styles.ledgerFooter}>
            <span>第 {page} / {pageCount} 页</span>
            <div>
              <button
                type="button"
                aria-label="上一页"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="下一页"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>
      )}

      <p className={styles.scopeNote}>
        {workspaceName}的当前页面使用固定演示数据；积分分配不计入组织消耗，余额与真实账本接入后将独立实时更新。
      </p>
    </section>
  );
}
