import { Check, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type {
  MembershipRole,
  OrganizationMember,
} from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

interface OrganizationRolePopoverProps {
  anchor: HTMLButtonElement | null;
  member: OrganizationMember;
  onClose: () => void;
  onSelect: (role: Exclude<MembershipRole, "owner">) => void;
  selectedRole: Exclude<MembershipRole, "owner">;
}

const roleOptions = [
  {
    description: "可管理组织成员与常规组织设置",
    icon: ShieldCheck,
    label: "管理员",
    value: "admin",
  },
  {
    description: "使用组织能力，不参与组织管理",
    icon: UserRound,
    label: "成员",
    value: "member",
  },
] as const;

export function OrganizationRolePopover({
  anchor,
  member,
  onClose,
  onSelect,
  selectedRole,
}: OrganizationRolePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const rect = anchor?.getBoundingClientRect();
  const panelWidth = 218;
  const panelHeight = 138;
  const gap = 10;
  const position = rect ? {
    left: rect.right + gap + panelWidth <= window.innerWidth - 12
      ? rect.right + gap
      : Math.max(12, rect.left - panelWidth - gap),
    top: Math.max(12, Math.min(rect.top - 10, window.innerHeight - panelHeight - 12)),
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
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [anchor, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={styles.rolePopover}
      style={position}
      role="dialog"
      aria-label={`调整 ${member.displayName} 的组织角色`}
    >
      <strong>调整组织角色</strong>
      <small>当前仅在本页预览</small>
      <div className={styles.roleOptions}>
        {roleOptions.map((option) => {
          const Icon = option.icon;
          const selected = selectedRole === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={selected ? styles.roleOptionSelected : ""}
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
            >
              <Icon aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
