import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

interface CreditAdjustmentPopoverProps {
  anchor: HTMLButtonElement | null;
  member: OrganizationMember;
  balance: number;
  availablePool: number;
  onClose: () => void;
  onGrant: (member: OrganizationMember, amount: number) => void;
  onReclaim: (member: OrganizationMember, amount: number) => void;
}

export function CreditAdjustmentPopover({
  anchor,
  member,
  balance,
  availablePool,
  onClose,
  onGrant,
  onReclaim,
}: CreditAdjustmentPopoverProps) {
  const [mode, setMode] = useState<"grant" | "reclaim">("grant");
  const [amount, setAmount] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const rect = anchor?.getBoundingClientRect();
  const panelWidth = 304;
  const panelHeight = 242;
  const gap = 7;
  const position = rect ? {
    left: Math.max(12, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12)),
    top: rect.bottom + panelHeight + gap <= window.innerHeight
      ? rect.bottom + gap
      : Math.max(12, rect.top - panelHeight - gap),
  } : null;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleViewportChange = () => onClose();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    amountInputRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      anchor?.focus();
    };
  }, [anchor, onClose]);

  if (!position) return null;

  const numericAmount = Number(amount);
  const maximum = mode === "grant" ? availablePool : balance;
  const amountIsValid = Number.isInteger(numericAmount)
    && numericAmount > 0
    && numericAmount <= maximum;
  const helperText = mode === "grant"
    ? `组织未分配余额 ${availablePool.toLocaleString("zh-CN")}`
    : `最多可回收 ${balance.toLocaleString("zh-CN")}`;
  const handleModeChange = (nextMode: "grant" | "reclaim") => {
    setMode(nextMode);
    setAmount("");
    requestAnimationFrame(() => amountInputRef.current?.focus());
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amountIsValid) return;
    if (mode === "grant") onGrant(member, numericAmount);
    else onReclaim(member, numericAmount);
  };

  return createPortal(
    <div
      ref={panelRef}
      className={styles.creditAdjustmentPopover}
      style={position}
      role="dialog"
      aria-label={`调整 ${member.displayName} 的积分额度`}
    >
      <div className={styles.creditAdjustmentHeader}>
        <span>
          <strong>{member.displayName} · 调整额度</strong>
          <small>{member.loginIdentifier ?? "组织成员"}</small>
        </span>
        <span className={styles.creditAdjustmentBalance}>
          <small>当前余额</small>
          <strong>{balance.toLocaleString("zh-CN")}</strong>
        </span>
      </div>
      <form className={styles.creditAdjustmentForm} onSubmit={handleSubmit}>
        <div className={styles.creditAdjustmentMode} aria-label="额度调整方式">
          <button
            className={mode === "grant" ? styles.creditAdjustmentModeSelected : undefined}
            type="button"
            aria-pressed={mode === "grant"}
            onClick={() => handleModeChange("grant")}
          >
            <ArrowDownToLine aria-hidden="true" />
            发放
          </button>
          <button
            className={mode === "reclaim" ? styles.creditAdjustmentModeSelected : undefined}
            type="button"
            aria-pressed={mode === "reclaim"}
            disabled={balance <= 0}
            onClick={() => handleModeChange("reclaim")}
          >
            <ArrowUpFromLine aria-hidden="true" />
            回收
          </button>
        </div>

        <label className={styles.creditAmountField}>
          <span>{mode === "grant" ? "发放数量" : "回收数量"}</span>
          <span className={styles.creditAmountControl}>
            <input
              ref={amountInputRef}
              type="number"
              min="1"
              max={maximum}
              step="1"
              inputMode="numeric"
              aria-label="积分数量"
              placeholder="输入积分数量"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <small>积分</small>
            {mode === "reclaim" && balance > 0 ? (
              <button type="button" onClick={() => setAmount(String(balance))}>
                全部回收
              </button>
            ) : null}
          </span>
        </label>

        <div className={styles.creditAdjustmentHint}>
          <span>{helperText}</span>
          {amount !== "" && !amountIsValid ? (
            <span role="alert">请输入 1 至 {maximum.toLocaleString("zh-CN")} 的整数</span>
          ) : null}
        </div>

        <div className={styles.creditAdjustmentFooter}>
          <button type="button" onClick={onClose}>取消</button>
          <button
            className={styles.creditAdjustmentConfirm}
            type="submit"
            disabled={!amountIsValid}
          >
            {mode === "grant" ? "确认发放" : "确认回收"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
