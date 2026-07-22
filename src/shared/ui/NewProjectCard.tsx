import { Plus } from "lucide-react";
import { Form } from "react-router-dom";

import type { WorkspaceId } from "../../domain/workspace/workspace";
import styles from "./ProjectCard.module.css";

interface NewProjectCardProps {
  workspaceId: WorkspaceId;
}

export function NewProjectCard({ workspaceId }: NewProjectCardProps) {
  return (
    <Form method="post" className={`${styles.card} ${styles.newCard}`}>
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <button type="submit" aria-label="新建项目">
        <span className={styles.addIcon}><Plus aria-hidden="true" /></span>
        <strong>新建项目</strong>
      </button>
    </Form>
  );
}
