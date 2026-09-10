import { useCallback, useEffect, useRef, useState } from "react";
import { Ellipsis, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProjectSummary } from "../../domain/project/project";
import { routePaths } from "../../app/routes";
import { resolveProjectCoverUrl } from "../projects/project-cover";
import styles from "./ProjectCard.module.css";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { useProjectMenu } from "./ProjectMenuProvider";
import { ProjectNameEditor } from "./ProjectNameEditor";

interface ProjectCardProps {
  onNotice: (message: string) => void;
  project: ProjectSummary;
}

function formatUpdatedAt(value: string): string {
  const updated = new Date(value);
  const year = updated.getFullYear();
  const month = String(updated.getMonth() + 1).padStart(2, "0");
  const day = String(updated.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ProjectCard({ onNotice, project }: ProjectCardProps) {
  const [renaming, setRenaming] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const restoreTitleFocus = useRef(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const coverUrl = resolveProjectCoverUrl(project.coverAssetId);
  const canEdit = project.currentUserRole !== "view";
  const canAdminister = project.currentUserRole === "admin";
  const canDelete = project.accessKind === "private" || canAdminister;
  const { closeMenu, menuOpen, toggleMenu } = useProjectMenu(project.id);

  const finishRename = useCallback((restoreFocus: boolean): void => {
    restoreTitleFocus.current = restoreFocus;
    setRenaming(false);
  }, []);

  useEffect(() => {
    if (!renaming && restoreTitleFocus.current) {
      restoreTitleFocus.current = false;
      titleRef.current?.focus();
    }
  }, [renaming]);

  function startRename(): void {
    closeMenu();
    setRenaming(true);
  }

  function showPrototypeNotice(message: string): void {
    closeMenu();
    onNotice(message);
  }

  return (
    <>
      <article className={styles.card}>
        <Link className={styles.visualLink} to={routePaths.canvas(project.workspaceId, project.id, "main")} aria-label={`打开项目 ${project.name}`}>
          <img src={coverUrl} alt="" decoding="async" loading="lazy" width={1280} height={720} />
        </Link>

        <div className={styles.info}>
          <div className={styles.titleRow}>
            {renaming ? (
              <ProjectNameEditor project={project} onClose={finishRename} />
            ) : canEdit ? (
              <button ref={titleRef} type="button" className={styles.projectName} onClick={startRename}
                aria-label={`重命名 ${project.name}`} title={project.name}>
                {project.name}
              </button>
            ) : (
              <Link className={styles.projectName} to={routePaths.canvas(project.workspaceId, project.id, "main")} title={project.name}>
                {project.name}
              </Link>
            )}
            <details
              className={styles.menuDetails}
              data-project-menu-id={project.id}
              open={menuOpen}
            >
              <summary
                className={styles.menuTrigger}
                aria-label={`打开 ${project.name} 的项目菜单`}
                onClick={(event) => {
                  event.preventDefault();
                  toggleMenu(event.currentTarget);
                }}
              >
                <Ellipsis aria-hidden="true" />
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
                      closeMenu();
                      setDeleteDialogOpen(true);
                    }}
                  >
                    删除项目
                  </button>
                ) : canEdit && project.accessKind === "collaborative" ? (
                  <button
                    className={styles.danger}
                    type="button"
                    role="menuitem"
                    aria-label="删除项目（仅项目管理员可用）"
                    title="仅项目管理员可删除"
                    disabled
                  >
                    删除项目
                  </button>
                ) : null}
              </div>
            </details>
          </div>
          <div className={styles.metaRow}>
            {project.accessKind === "collaborative" ? <span className={styles.collaboration} role="img" aria-label="协作项目" title="协作项目"><UsersRound aria-hidden="true" /></span> : null}
            <time dateTime={project.updatedAt}>{formatUpdatedAt(project.updatedAt)}</time>
          </div>
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
