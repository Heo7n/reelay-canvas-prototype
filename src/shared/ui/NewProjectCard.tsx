import { LoaderCircle, Plus } from "lucide-react";
import { Form, useNavigation } from "react-router-dom";

import cardStyles from "./ProjectCard.module.css";
import styles from "./NewProjectCard.module.css";

interface NewProjectCardProps {
  personalNote?: boolean;
}

export function NewProjectCard({ personalNote = false }: NewProjectCardProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const creating = navigation.formData?.get("intent") === "create";

  return (
    <Form method="post" className={styles.form} onSubmit={(event) => { if (busy) event.preventDefault(); }}>
      <input type="hidden" name="intent" value="create" />
      <button type="submit" className={`${cardStyles.card} ${styles.card}`} disabled={busy} aria-busy={busy}
        aria-label="新建项目" title="创建个人项目并打开空白画布">
        <span className={`${cardStyles.visualLink} ${styles.cover}`}>
          <span className={styles.content}>
            {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <Plus aria-hidden="true" />}
            <span>{busy ? creating ? "正在创建…" : "正在打开…" : "新建项目"}</span>
          </span>
        </span>
        <span className={`${cardStyles.info} ${styles.info}`}>
          <span className={cardStyles.titleRow}>从空白画布开始</span>
          {personalNote ? <span className={cardStyles.metaRow}>创建个人项目</span> : null}
        </span>
      </button>
    </Form>
  );
}
