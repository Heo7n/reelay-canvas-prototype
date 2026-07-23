function segment(value: string) {
  return encodeURIComponent(value);
}

export const appRoutes = {
  login: () => "/app/login",
  logout: () => "/app/logout",
  noWorkspace: () => "/app/no-workspace",
  workspaceHome: (workspaceId: string) => `/app/w/${segment(workspaceId)}`,
  projects: (workspaceId: string) => `/app/w/${segment(workspaceId)}/projects`,
  canvas: (workspaceId: string, projectId: string, canvasId: string) =>
    `/app/w/${segment(workspaceId)}/projects/${segment(projectId)}/canvases/${segment(canvasId)}`,
  assets: (workspaceId: string) => `/app/w/${segment(workspaceId)}/assets`,
  generations: (workspaceId: string) => `/app/w/${segment(workspaceId)}/generations`,
  members: (workspaceId: string) => `/app/w/${segment(workspaceId)}/members`,
  settings: () => "/app/settings",
} as const;

export const routePaths = {
  account: () => "/account",
  login: () => "/login",
  logout: () => "/logout",
  noWorkspace: () => "/no-workspace",
  workspaceHome: (workspaceId: string) => `/w/${segment(workspaceId)}`,
  projects: (workspaceId: string) => `/w/${segment(workspaceId)}/projects`,
  canvas: (workspaceId: string, projectId: string, canvasId: string) =>
    `/w/${segment(workspaceId)}/projects/${segment(projectId)}/canvases/${segment(canvasId)}`,
} as const;
