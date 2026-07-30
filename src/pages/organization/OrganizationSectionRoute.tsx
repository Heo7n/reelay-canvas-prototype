import { LockKeyhole } from "lucide-react";
import { useOutletContext } from "react-router-dom";

import { OrganizationCreditsSection } from "./OrganizationCreditsSection";
import type { OrganizationCenterOutletContext } from "./OrganizationCenterPage";
import { OrganizationManagementSection } from "./OrganizationManagementSection";
import { OrganizationUsageSection } from "./OrganizationUsageSection";
import styles from "./OrganizationCenterPage.module.css";

export type OrganizationSection = "management" | "credits" | "usage";

interface OrganizationSectionRouteProps {
  section: OrganizationSection;
}

export function OrganizationSectionRoute({ section }: OrganizationSectionRouteProps) {
  const { data, showNotice } = useOutletContext<OrganizationCenterOutletContext>();

  if (section === "management") {
    return (
      <OrganizationManagementSection
        actor={data.actor}
        members={data.members}
        workspace={data.currentWorkspace}
        onNotice={showNotice}
      />
    );
  }

  if (section === "credits") {
    return <OrganizationCreditsSection members={data.members} onNotice={showNotice} />;
  }

  const currentRole = data.currentWorkspace.currentUserRole ?? "member";
  const canViewUsage = currentRole === "owner" || currentRole === "admin";

  if (!canViewUsage) {
    return (
      <section className={styles.permissionState}>
        <LockKeyhole aria-hidden="true" />
        <strong>此页面仅对主账户与管理员开放</strong>
        <p>组织成员仍可在个人积分记录中查看与自己相关的余额信息。</p>
      </section>
    );
  }

  return (
    <OrganizationUsageSection
      members={data.members}
      workspaceName={data.currentWorkspace.name}
    />
  );
}
