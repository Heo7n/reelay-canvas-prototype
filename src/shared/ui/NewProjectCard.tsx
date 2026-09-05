import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Form, useNavigation } from "react-router-dom";

import styles from "./ProjectCard.module.css";

interface NewProjectCardProps {
  description?: string;
  disabled?: boolean;
  label?: string;
}

export function NewProjectCard({
  description = "个人项目 · 仅自己可见",
  disabled = false,
  label = "新建项目",
}: NewProjectCardProps) {
  const navigation = useNavigation();
  const creatingProject = navigation.state !== "idle"
    && navigation.formData?.get("intent") === "create";
  const creationBusy = disabled || creatingProject;

  function preventConcurrentCreate(event: FormEvent<HTMLFormElement>): void {
    if (creationBusy) event.preventDefault();
  }

  return (
    <Form method="post" className={`${styles.card} ${styles.newCard}`} onSubmit={preventConcurrentCreate}>
      <input type="hidden" name="intent" value="create" />
      <button
        type="submit"
        aria-busy={creationBusy}
        aria-label={creatingProject ? "正在创建个人项目" : `${label}，创建仅自己可见的个人项目`}
        disabled={creationBusy}
      >
        <span className={styles.addIcon}><Plus aria-hidden="true" /></span>
        <strong>{creatingProject ? "正在创建…" : label}</strong>
        {description ? <small className={styles.newCardDescription}>{description}</small> : null}
      </button>
    </Form>
  );
}
