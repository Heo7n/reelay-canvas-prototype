import { Form, useLoaderData } from "react-router-dom";

import type { SessionActor } from "../../domain/identity/session";
import { routePaths } from "../../app/routes";
import styles from "./system-pages.module.css";

export function NoWorkspacePage() {
  const { actor } = useLoaderData() as { actor: SessionActor };

  return (
    <main className={styles.page}>
      <span className={styles.avatar} aria-hidden="true">{actor.displayName.slice(0, 1).toUpperCase()}</span>
      <h1>还没有可用的工作空间</h1>
      <p>请由组织管理员添加成员，或稍后创建个人空间。</p>
      <Form method="post" action={routePaths.logout()}>
        <button type="submit">退出当前账号</button>
      </Form>
    </main>
  );
}
