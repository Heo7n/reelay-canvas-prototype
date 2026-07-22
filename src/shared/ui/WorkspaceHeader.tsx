import { Building2, LogOut, Moon, Sparkles, Sun, UserRound } from "lucide-react";
import { Form, Link } from "react-router-dom";

import type { SessionActor } from "../../domain/identity/session";
import type { Workspace } from "../../domain/workspace/workspace";
import { routePaths } from "../../app/routes";
import { useTheme } from "../theme/theme";
import { Brand } from "./Brand";
import styles from "./WorkspaceHeader.module.css";

interface WorkspaceHeaderProps {
  actor: SessionActor;
  currentWorkspace: Workspace;
  workspaces: Workspace[];
}

export function WorkspaceHeader({ actor, currentWorkspace, workspaces }: WorkspaceHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const avatar = actor.displayName.slice(0, 1).toUpperCase();

  return (
    <header className={styles.header}>
      <Brand to={routePaths.workspaceHome(currentWorkspace.id)} />

      <div className={styles.account}>
        <button className={styles.credit} type="button" aria-label="可用积分 3000">
          <Sparkles aria-hidden="true" />
          <span>3000</span>
        </button>

        <details className={styles.profile}>
          <summary className={styles.avatar} aria-label="打开账户菜单">{avatar}</summary>
          <div className={styles.menu}>
            <div className={styles.identity}>
              <span className={styles.identityAvatar} aria-hidden="true">{avatar}</span>
              <span>
                <strong>{actor.displayName}</strong>
                <small>本地演示账号</small>
              </span>
            </div>

            <div className={styles.creditSummary}>
              <span>可用积分</span>
              <strong>3000</strong>
              <small>累计消耗 0 积分</small>
            </div>

            <span className={styles.label}>工作空间</span>
            {workspaces.map((workspace) => (
              <Link
                className={`${styles.menuItem} ${workspace.id === currentWorkspace.id ? styles.current : ""}`}
                key={workspace.id}
                to={routePaths.workspaceHome(workspace.id)}
              >
                {workspace.kind === "personal" ? <UserRound aria-hidden="true" /> : <Building2 aria-hidden="true" />}
                <span>{workspace.name}</span>
                {workspace.id === currentWorkspace.id ? <small>当前</small> : null}
              </Link>
            ))}

            <div className={styles.divider} />
            <button className={styles.menuItem} type="button" onClick={toggleTheme}>
              {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              <span>{theme === "light" ? "深色模式" : "浅色模式"}</span>
            </button>
            <Form method="post" action={routePaths.logout()}>
              <button className={`${styles.menuItem} ${styles.signOut}`} type="submit">
                <LogOut aria-hidden="true" />
                <span>退出演示账号</span>
              </button>
            </Form>
          </div>
        </details>
      </div>
    </header>
  );
}
