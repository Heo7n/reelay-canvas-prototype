interface OrganizationLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

interface OrganizationNavigationState {
  organizationReturnTo?: string;
}

function pathSegments(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || /[\u0000-\u0020\u007f]/.test(value)) {
    return undefined;
  }
  const pathname = value.split(/[?#]/, 1)[0]!;
  try {
    const segments = pathname.slice(1).split("/").map(decodeURIComponent);
    // Validate before any URL normalization can hide dot segments or encoded separators.
    if (segments.some((segment) => !segment || segment === "." || segment === ".."
      || /[\\/\u0000-\u001f\u007f]/.test(segment) || /%[0-9a-f]{2}/i.test(segment))) {
      return undefined;
    }
    return segments;
  } catch {
    return undefined;
  }
}

function workspaceSegments(workspaceId: string, value: unknown): string[] | undefined {
  const segments = pathSegments(value);
  return segments?.[0] === "w" && segments[1] === workspaceId ? segments : undefined;
}

function isCanvasSegments(segments: string[]): boolean {
  return segments.length === 6 && segments[2] === "projects" && segments[4] === "canvases";
}

function returnToFromState(state: unknown): unknown {
  return state && typeof state === "object" && !Array.isArray(state)
    && Object.hasOwn(state, "organizationReturnTo")
    ? (state as OrganizationNavigationState).organizationReturnTo
    : undefined;
}

function validatedReturnTo(workspaceId: string, value: unknown): string | undefined {
  const segments = workspaceSegments(workspaceId, value);
  return segments && (segments.length === 2
    || (segments.length === 3 && segments[2] === "projects")
    || isCanvasSegments(segments))
    ? value as string
    : undefined;
}

export function isOrganizationPath(workspaceId: string, pathname: string): boolean {
  const segments = workspaceSegments(workspaceId, pathname);
  return Boolean(segments && segments[2] === "organization"
    && (segments.length === 3
      || (segments.length === 4 && (segments[3] === "credits" || segments[3] === "usage"))));
}

export function organizationNavigationState(
  workspaceId: string,
  location: OrganizationLocation,
): OrganizationNavigationState {
  const candidate = isOrganizationPath(workspaceId, location.pathname)
    ? returnToFromState(location.state)
    : `${location.pathname}${location.search}${location.hash}`;
  const organizationReturnTo = validatedReturnTo(workspaceId, candidate);
  return organizationReturnTo ? { organizationReturnTo } : {};
}

export function organizationCanvasReturnTo(workspaceId: string, state: unknown): string | undefined {
  const candidate = returnToFromState(state);
  const segments = workspaceSegments(workspaceId, candidate);
  return segments && isCanvasSegments(segments) ? candidate as string : undefined;
}
