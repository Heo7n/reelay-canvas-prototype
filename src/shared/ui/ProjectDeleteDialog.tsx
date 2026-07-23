import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Form, useNavigation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

import type { ProjectSummary } from "../../domain/project/project";
import styles from "./ProjectDeleteDialog.module.css";

interface ProjectDeleteDialogProps {
  onClose: () => void;
  open: boolean;
  project: ProjectSummary;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function ProjectDeleteDialog({
  onClose,
  open,
  project,
  returnFocusRef,
}: ProjectDeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const navigation = useNavigation();
  const deletingThisProject = navigation.state === "submitting"
    && navigation.formData?.get("intent") === "delete"
    && navigation.formData?.get("projectId") === project.id;

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deletingThisProject) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !deletingThisProject) {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const first = cancelButtonRef.current;
          const last = deleteButtonRef.current;
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <span className={styles.icon} aria-hidden="true"><AlertTriangle /></span>
        <div className={styles.copy}>
          <h2 id={titleId}>删除“{project.name}”？</h2>
          <p id={descriptionId}>
            项目会立即从最近项目和全部项目中移除。项目成员关系与画布数据会保留，供后续恢复机制使用。
          </p>
          {project.accessKind === "collaborative" ? (
            <p className={styles.collaborationWarning}>协作成员也将无法继续访问这个项目。</p>
          ) : null}
        </div>

        <Form method="post" className={styles.actions}>
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="projectId" value={project.id} />
          <button
            ref={cancelButtonRef}
            type="button"
            className={styles.cancel}
            disabled={deletingThisProject}
            onClick={onClose}
          >
            取消
          </button>
          <button
            ref={deleteButtonRef}
            type="submit"
            className={styles.confirm}
            disabled={deletingThisProject}
          >
            {deletingThisProject ? "正在删除…" : "删除项目"}
          </button>
        </Form>
      </section>
    </div>,
    document.body,
  );
}
