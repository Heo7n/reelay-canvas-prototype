import { useEffect, useId, useRef, useState, type FormEvent } from "react";
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
import { useProjectMenu } from "./ProjectMenuProvider";

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
  const [renameDraft, setRenameDraft] = useState(project.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const cancelRename = useRef(false);
  const renameSubmissionInFlight = useRef(false);
  const previousFetcherState = useRef(fetcher.state);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const renameErrorId = useId();
  const coverUrl = project.coverAssetId ? coverUrls[project.coverAssetId] : undefined;
  const canEdit = project.currentUserRole !== "view";
  const canAdminister = project.currentUserRole === "admin";
  const canDelete = canAdminister;
  const renamePending = renameSubmissionInFlight.current && fetcher.state !== "idle";
  const { closeMenu, menuOpen, toggleMenu } = useProjectMenu(project.id);

  useEffect(() => {
    const previousState = previousFetcherState.current;
    previousFetcherState.current = fetcher.state;
    if (
      !renameSubmissionInFlight.current
      || previousState === "idle"
      || fetcher.state !== "idle"
    ) return;

    renameSubmissionInFlight.current = false;
    if (fetcher.data?.ok) {
      setRenameError(null);
      setRenaming(false);
      return;
    }

    setRenameError(fetcher.data?.error ?? "项目名称保存失败，请重试。");
  }, [fetcher.data, fetcher.state]);

  function startRename(): void {
    cancelRename.current = false;
    closeMenu();
    setRenameDraft(project.name);
    setRenameError(null);
    setRenaming(true);
  }

  function submitRename(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (renameSubmissionInFlight.current || fetcher.state !== "idle") return;

    const normalizedName = renameDraft.trim();
    if (!normalizedName) {
      setRenameError("项目名称不能为空。");
      return;
    }
    if (normalizedName === project.name.trim()) {
      setRenameDraft(project.name);
      setRenameError(null);
      setRenaming(false);
      return;
    }

    const formData = new FormData();
    formData.set("intent", "rename");
    formData.set("projectId", project.id);
    formData.set("name", normalizedName);
    setRenameDraft(normalizedName);
    setRenameError(null);
    renameSubmissionInFlight.current = true;
    void fetcher.submit(formData, {
      method: "post",
      action: routePaths.workspaceHome(project.workspaceId),
    });
  }

  function showPrototypeNotice(message: string): void {
    closeMenu();
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
          <EllipsisVertical aria-hidden="true" />
        </summary>
        <div className={styles.menu} role="menu">
          <Link role="menuitem" to={routePaths.canvas(project.workspaceId, project.id, "main")}>打开</Link>
          {canEdit ? <button type="button" role="menuitem" onClick={startRename}>重命名</button> : null}
          {canEdit ? <button type="button" role="menuitem" onClick={() => showPrototypeNotice("项目封面编辑尚未接入；后续将与可复用资产能力一起开放。")}>修改封面</button> : null}
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

      <div className={styles.info}>
        {renaming ? (
          <fetcher.Form
            method="post"
            action={routePaths.workspaceHome(project.workspaceId)}
            className={styles.renameForm}
            onSubmit={submitRename}
          >
            <input type="hidden" name="intent" value="rename" />
            <input type="hidden" name="projectId" value={project.id} />
            <input
              name="name"
              value={renameDraft}
              maxLength={100}
              autoFocus
              aria-label="项目名称"
              aria-busy={renamePending}
              aria-describedby={renameError ? renameErrorId : undefined}
              aria-invalid={Boolean(renameError)}
              disabled={renamePending}
              onChange={(event) => {
                setRenameDraft(event.currentTarget.value);
                if (renameError) setRenameError(null);
              }}
              onBlur={(event) => {
                if (cancelRename.current) {
                  cancelRename.current = false;
                  return;
                }
                if (renameSubmissionInFlight.current || renamePending) return;
                event.currentTarget.form?.requestSubmit();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename.current = true;
                  setRenameDraft(project.name);
                  setRenameError(null);
                  setRenaming(false);
                }
              }}
            />
            {renameError ? (
              <span id={renameErrorId} className={styles.renameFeedback} role="alert">
                {renameError}
              </span>
            ) : null}
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
