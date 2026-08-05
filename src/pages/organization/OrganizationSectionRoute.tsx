import { Navigate, useOutletContext } from "react-router-dom";

import { routePaths } from "../../app/routes";
import { OrganizationCreditsSection } from "./OrganizationCreditsSection";
import type { OrganizationCenterOutletContext } from "./OrganizationCenterPage";
import { OrganizationManagementSection } from "./OrganizationManagementSection";
import { OrganizationUsageSection } from "./OrganizationUsageSection";

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

  const currentRole = data.currentWorkspace.currentUserRole ?? "member";
  const canManageOrganization = currentRole === "owner" || currentRole === "admin";

  if (!canManageOrganization) {
    return (
      <Navigate
        replace
        to={routePaths.organization(data.currentWorkspace.id)}
      />
    );
  }

  if (section === "credits") {
    return <OrganizationCreditsSection members={data.members} onNotice={showNotice} />;
  }

  return (
    <OrganizationUsageSection
      members={data.members}
      workspaceName={data.currentWorkspace.name}
    />
  );
}
