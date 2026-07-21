function segment(value: string) {
  return encodeURIComponent(value);
}

export const appRoutes = {
  login: () => "/app/login",
  workspaceHome: (workspaceId: string) => `/app/w/${segment(workspaceId)}`,
  projects: (workspaceId: string) => `/app/w/${segment(workspaceId)}/projects`,
  canvas: (workspaceId: string, projectId: string, canvasId: string) =>
    `/app/w/${segment(workspaceId)}/projects/${segment(projectId)}/canvases/${segment(canvasId)}`,
  assets: (workspaceId: string) => `/app/w/${segment(workspaceId)}/assets`,
  generations: (workspaceId: string) => `/app/w/${segment(workspaceId)}/generations`,
  members: (workspaceId: string) => `/app/w/${segment(workspaceId)}/members`,
  settings: () => "/app/settings",
} as const;
