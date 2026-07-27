import { Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

interface CreditAdjustmentPopoverProps {
  anchor: HTMLButtonElement | null;
  member: OrganizationMember;
  onClose: () => void;
  onGrant: (member: OrganizationMember) => void;
  onReclaim: (member: OrganizationMember) => void;
}

export function CreditAdjustmentPopover({
  anchor,
  member,
  onClose,
  onGrant,
  onReclaim,
}: CreditAdjustmentPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const rect = anchor?.getBoundingClientRect();
  const panelWidth = 156;
  const panelHeight = 90;
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
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      anchor?.focus();
    };
  }, [anchor, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={styles.creditAdjustmentPopover}
      style={position}
      role="dialog"
      aria-label={`调整 ${member.displayName} 的积分额度`}
    >
      <button type="button" onClick={() => onGrant(member)}>
        <Plus aria-hidden="true" />
        <span>发放积分</span>
      </button>
      <button type="button" onClick={() => onReclaim(member)}>
        <Minus aria-hidden="true" />
        <span>回收积分</span>
      </button>
    </div>,
    document.body,
  );
}
