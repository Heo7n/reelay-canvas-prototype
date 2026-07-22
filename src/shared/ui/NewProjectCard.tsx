import { Plus } from "lucide-react";
import { Form } from "react-router-dom";

import styles from "./ProjectCard.module.css";

export function NewProjectCard() {
  return (
    <Form method="post" className={`${styles.card} ${styles.newCard}`}>
      <input type="hidden" name="intent" value="create" />
      <button type="submit" aria-label="新建项目">
        <span className={styles.addIcon}><Plus aria-hidden="true" /></span>
        <strong>新建项目</strong>
      </button>
    </Form>
  );
}
