import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import type {
  UsageCompositionItem,
  UsageDimension,
  UsageRecord,
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

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function getDimensionId(record: UsageRecord, dimension: UsageDimension): string {
  if (dimension === "type") return record.activityKind;
  if (dimension === "member") return record.memberId;
  if (dimension === "project") return record.projectId;
  return record.modelId;
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
    const visibleIds = new Set(
      composition
        .filter((entry) => !entry.id.startsWith("other-"))
        .map((entry) => entry.id),
    );
    return records
      .filter((record) => {
        const recordDimensionId = getDimensionId(record, dimension);
        return item.id.startsWith("other-")
          ? !visibleIds.has(recordDimensionId)
          : recordDimensionId === item.id;
      })
      .sort(
        (left, right) => (
          new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
        ),
      );
  }, [composition, dimension, item, records]);

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
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
            <small>{rangeLabel} · 按{dimensionLabels[dimension]}查看</small>
            <h2 id="usage-detail-title">{item.label}消耗明细</h2>
            <p>当前筛选累计消耗 {item.credits.toLocaleString("zh-CN")} 积分</p>
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

        <div className={styles.usageDetailTable} role="table" aria-label={`${item.label}消耗记录`}>
          <div className={styles.usageDetailTableHeader} role="row">
            <span role="columnheader">时间</span>
            <span role="columnheader">成员与项目</span>
            <span role="columnheader">模型与规格</span>
            <span role="columnheader">积分</span>
          </div>
          {filteredRecords.slice(0, 20).map((record) => (
            <article key={record.id} role="row">
              <span role="cell">{dateTimeFormatter.format(new Date(record.occurredAt))}</span>
              <span role="cell">
                <strong>{record.memberName}</strong>
                <small>{record.projectName}</small>
              </span>
              <span role="cell">
                <strong>{record.modelName}</strong>
                <small>{record.specification}</small>
              </span>
              <span
                className={record.status === "refunded" ? styles.refundedUsage : undefined}
                role="cell"
              >
                <strong>{record.credits.toLocaleString("zh-CN")}</strong>
                <small>{record.status === "refunded" ? "已退回" : "已结算"}</small>
              </span>
            </article>
          ))}
        </div>

        <footer className={styles.usageDrawerFooter}>
          <span>
            {filteredRecords.length > 20
              ? `展示最近 20 条，共 ${filteredRecords.length} 条`
              : `当前共 ${filteredRecords.length} 条记录`}
          </span>
          <Link to="../credits" onClick={onClose}>
            查看完整积分流水
            <ArrowRight aria-hidden="true" />
          </Link>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
