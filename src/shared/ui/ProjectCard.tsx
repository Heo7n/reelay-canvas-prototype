import { useRef, useState } from "react";
import { EllipsisVertical, Pencil, UsersRound } from "lucide-react";
import { Link, useFetcher } from "react-router-dom";

import characterCoverUrl from "../../../assets/home/project-character.webp";
import educationCoverUrl from "../../../assets/home/project-education.webp";
import perfumeCoverUrl from "../../../assets/home/project-perfume.webp";
import productCoverUrl from "../../../assets/home/project-product.webp";
import scifiCoverUrl from "../../../assets/home/project-scifi.webp";
import type { ProjectSummary } from "../../domain/project/project";
import { routePaths } from "../../app/routes";
import type { WorkspaceActionData } from "../../app/route-data";
import styles from "./ProjectCard.module.css";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";

const coverUrls: Record<string, string> = {
  "demo-cover-character": characterCoverUrl,
  "demo-cover-education": educationCoverUrl,
  "demo-cover-perfume": perfumeCoverUrl,
  "demo-cover-product": productCoverUrl,
  "demo-cover-scifi": scifiCoverUrl,
};

interface ProjectCardProps {
  onNotice: (message: string) => void;
  project: ProjectSummary;
}

function formatUpdatedAt(value: string): string {
  const updated = new Date(value);
  const now = new Date();
  const sameDay = updated.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${updated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (updated.toDateString() === yesterday.toDateString()) {
    return `昨天 ${updated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return updated.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function ProjectCard({ onNotice, project }: ProjectCardProps) {
  const fetcher = useFetcher<WorkspaceActionData>();
  const [renaming, setRenaming] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const cancelRename = useRef(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const menuDetails = useRef<HTMLDetailsElement>(null);
  const coverUrl = project.coverAssetId ? coverUrls[project.coverAssetId] : undefined;
  const canEdit = project.currentUserRole !== "view";
  const canAdminister = project.currentUserRole === "admin";
  const canDelete = project.accessKind === "private" || canAdminister;

  function startRename(): void {
    cancelRename.current = false;
    if (menuDetails.current) menuDetails.current.open = false;
    setRenaming(true);
  }

  function showPrototypeNotice(message: string): void {
    if (menuDetails.current) menuDetails.current.open = false;
    onNotice(message);
  }

  return (
    <>
      <article className={styles.card}>
      <Link className={styles.visualLink} to={routePaths.canvas(project.workspaceId, project.id, "main")} aria-label={`打开项目 ${project.name}`}>
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className={styles.semanticCover} data-project-seed={project.id.length % 4} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
      </Link>

      <details className={styles.menuDetails} ref={menuDetails}>
        <summary className={styles.menuTrigger} aria-label={`打开 ${project.name} 的项目菜单`}>
          <EllipsisVertical aria-hidden="true" />
        </summary>
        <div className={styles.menu} role="menu">
          <Link role="menuitem" to={routePaths.canvas(project.workspaceId, project.id, "main")}>打开</Link>
          {canEdit ? <button type="button" role="menuitem" onClick={startRename}>重命名</button> : null}
          {canEdit ? <button type="button" role="menuitem" onClick={() => showPrototypeNotice("封面上传将在项目持久化阶段接入。")}>修改封面</button> : null}
          {canAdminister && project.accessKind === "private" ? (
            <button type="button" role="menuitem" onClick={() => showPrototypeNotice("转为协作项目后可添加组织成员并分配权限，暂未接入。")}>转为协作项目</button>
          ) : null}
          {canDelete ? (
            <button
              ref={deleteTriggerRef}
              className={styles.danger}
              type="button"
              role="menuitem"
              aria-haspopup="dialog"
              onClick={() => {
                if (menuDetails.current) menuDetails.current.open = false;
                setDeleteDialogOpen(true);
              }}
            >
              删除项目
            </button>
          ) : null}
        </div>
      </details>

      <div className={styles.info}>
        {renaming ? (
          <fetcher.Form
            method="post"
            action={routePaths.workspaceHome(project.workspaceId)}
            className={styles.renameForm}
            onSubmit={() => setRenaming(false)}
          >
            <input type="hidden" name="intent" value="rename" />
            <input type="hidden" name="projectId" value={project.id} />
            <input
              name="name"
              defaultValue={project.name}
              maxLength={100}
              autoFocus
              aria-label="项目名称"
              onBlur={(event) => {
                if (cancelRename.current) {
                  cancelRename.current = false;
                  return;
                }
                event.currentTarget.form?.requestSubmit();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename.current = true;
                  setRenaming(false);
                }
              }}
            />
          </fetcher.Form>
        ) : (
          <div className={styles.titleRow}>
            <Link to={routePaths.canvas(project.workspaceId, project.id, "main")}>{project.name}</Link>
            {canEdit ? (
              <button type="button" className={styles.quickRename} onClick={startRename} aria-label={`重命名 ${project.name}`}>
                <Pencil aria-hidden="true" />
              </button>
            ) : null}
          </div>
        )}

        <div className={styles.metaRow}>
          <time dateTime={project.updatedAt}>{formatUpdatedAt(project.updatedAt)}</time>
          {project.accessKind === "collaborative" ? <UsersRound aria-label="协作项目" /> : null}
        </div>
        {fetcher.data?.error ? <span className={styles.srOnly} role="alert">{fetcher.data.error}</span> : null}
      </div>
      </article>
      <ProjectDeleteDialog
        open={deleteDialogOpen}
        project={project}
        returnFocusRef={deleteTriggerRef}
        onClose={() => setDeleteDialogOpen(false)}
      />
    </>
  );
}
