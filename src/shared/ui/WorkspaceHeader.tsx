import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FolderKanban,
  House,
  Keyboard,
  LogOut,
  Moon,
  SendHorizontal,
  Settings,
  Sun,
} from "lucide-react";
import { Form, Link, useLocation } from "react-router-dom";

import type { SessionActor } from "../../domain/identity/session";
import type { Workspace } from "../../domain/workspace/workspace";
import { routePaths } from "../../app/routes";
import {
  AccountSettingsDialog,
  type AccountSection,
} from "../../features/account/AccountSettingsDialog";
import { useTheme } from "../theme/theme";
import { Brand } from "./Brand";
import { CreditIcon } from "./CreditIcon";
import styles from "./WorkspaceHeader.module.css";

const manualUrl = "https://reelay.tech.jetsentv.com/manual";
const feedbackUrl = "https://ycndvyll62ov.feishu.cn/share/base/form/shrcnCSKgzknYF8PZuoMdw8uLGd";
const membershipRoleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

const shortcuts = [
  ["空格 + 拖动", "平移画布"],
  ["鼠标滚轮", "平移画布"],
  ["Ctrl/Cmd + 滚轮", "缩放"],
  ["双击画布", "新建节点"],
  ["拖拽空白", "框选"],
  ["Alt + 拖动", "复制节点"],
  ["Delete", "删除选中"],
  ["Ctrl + Z", "撤销上一步"],
] as const;

interface WorkspaceHeaderProps {
  activeSection?: "home" | "projects";
  actor: SessionActor;
  currentWorkspace: Workspace;
  showAccount?: boolean;
}

function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ right: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  function clearCloseTimer(): void {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function show(): void {
    clearCloseTimer();
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuRect = anchorRef.current?.closest<HTMLElement>("[data-account-menu]")?.getBoundingClientRect();
    setPosition({
      right: Math.max(12, window.innerWidth - (menuRect?.left ?? rect.left) + 12),
      top: Math.max(12, Math.min(rect.top - 4, window.innerHeight - 275)),
    });
    setOpen(true);
  }

  function close(): void {
    clearCloseTimer();
    setOpen(false);
    setPosition(null);
  }

  function closeSoon(): void {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(close, 180);
  }

  useEffect(() => {
    if (!open) return undefined;
    const handleViewportChange = () => close();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  useEffect(() => () => clearCloseTimer(), []);

  return (
    <>
      <button
        className={styles.helpLink}
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        onBlur={closeSoon}
        onClick={show}
        onFocus={show}
        onPointerEnter={show}
        onPointerLeave={closeSoon}
      >
        <Keyboard aria-hidden="true" />
        <span>快捷键</span>
      </button>
      {open && position ? createPortal(
        <div
          className={styles.shortcutSheetPortal}
          style={{ right: position.right, top: position.top }}
          aria-label="快捷键说明"
          onPointerEnter={clearCloseTimer}
          onPointerLeave={closeSoon}
        >
          {shortcuts.map(([keys, action]) => (
            <div className={styles.shortcutRow} key={keys}>
              <span>{keys}</span>
              <kbd>{action}</kbd>
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function WorkspaceHeader({
  activeSection,
  actor,
  currentWorkspace,
  showAccount = true,
}: WorkspaceHeaderProps) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountSettingsSection, setAccountSettingsSection] = useState<AccountSection>("profile");
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const profileRef = useRef<HTMLDetailsElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const avatar = actor.displayName.slice(0, 1).toUpperCase();
  const membershipRole = currentWorkspace.currentUserRole ?? "member";

  function clearCloseTimer(): void {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openProfile(): void {
    clearCloseTimer();
    setProfileOpen(true);
  }

  function closeProfile(): void {
    clearCloseTimer();
    setProfileOpen(false);
    setHelpOpen(false);
  }

  function scheduleCloseProfile(): void {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(closeProfile, 180);
  }

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        clearCloseTimer();
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      clearCloseTimer();
    };
  }, []);

  return (
    <>
      <header className={`${styles.header} ${activeSection ? styles.headerWithNavigation : ""}`}>
        <Brand to={routePaths.workspaceHome(currentWorkspace.id)} />

        {activeSection ? (
          <nav className={styles.primaryNavigation} aria-label="工作台主导航">
            <Link
              className={activeSection === "home" ? styles.activePrimaryNavigation : ""}
              to={routePaths.workspaceHome(currentWorkspace.id)}
              aria-current={activeSection === "home" ? "page" : undefined}
            >
              <House aria-hidden="true" />
              <span>创作首页</span>
            </Link>
            <Link
              className={activeSection === "projects" ? styles.activePrimaryNavigation : ""}
              to={routePaths.projects(currentWorkspace.id)}
              aria-current={activeSection === "projects" ? "page" : undefined}
            >
              <FolderKanban aria-hidden="true" />
              <span>项目空间</span>
            </Link>
          </nav>
        ) : null}

        {showAccount ? (
          <div className={styles.account}>
            <details
              className={styles.profile}
              ref={profileRef}
              open={profileOpen}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeProfile();
              }}
              onPointerEnter={openProfile}
              onPointerLeave={scheduleCloseProfile}
            >
              <summary
                className={styles.accountTrigger}
                aria-label="打开账户菜单"
                aria-expanded={profileOpen}
                onClick={(event) => {
                  event.preventDefault();
                  openProfile();
                }}
              >
                <span className={styles.organizationMark} aria-hidden="true"><Building2 /></span>
                <span className={styles.organizationName} title={currentWorkspace.name}>{currentWorkspace.name}</span>
                <ChevronDown className={styles.accountChevron} aria-hidden="true" />
                <span className={styles.triggerAvatar} aria-hidden="true">{avatar}</span>
              </summary>

              <div
                className={styles.menu}
                data-account-menu
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => {
                  if (!helpOpen || !helpTriggerRef.current) return;
                  if (event.clientY < helpTriggerRef.current.getBoundingClientRect().top - 2) setHelpOpen(false);
                }}
              >
                <div className={styles.identity}>
                  <span className={styles.identityAvatar} aria-hidden="true">{avatar}</span>
                  <span>
                    <strong>{actor.displayName}</strong>
                    <small>{actor.account}</small>
                  </span>
                </div>

                <div className={styles.accountOverview}>
                  <Link
                    className={styles.overviewRow}
                    state={{
                      organizationReturnTo: `${location.pathname}${location.search}${location.hash}`,
                    }}
                    to={routePaths.organization(currentWorkspace.id)}
                    aria-label={`进入${currentWorkspace.name}组织信息`}
                    onClick={closeProfile}
                  >
                    <Building2 aria-hidden="true" />
                    <span className={styles.overviewLabel}>{currentWorkspace.name}</span>
                    <span className={styles.overviewMeta}>{membershipRoleLabels[membershipRole]}</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>

                  <button
                    className={styles.overviewRow}
                    type="button"
                    aria-label="查看我的积分"
                    onClick={() => {
                      closeProfile();
                      setAccountSettingsSection("credits");
                      setAccountSettingsOpen(true);
                    }}
                  >
                    <CreditIcon className={styles.creditSemanticIcon} />
                    <span className={styles.overviewLabel}>我的积分</span>
                    <strong className={styles.creditValue}>3,000</strong>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>

                <div className={styles.menuList}>
                  <button
                    className={styles.menuItem}
                    type="button"
                    onClick={() => {
                      closeProfile();
                      setAccountSettingsSection("profile");
                      setAccountSettingsOpen(true);
                    }}
                  >
                    <Settings aria-hidden="true" />
                    <span>账号设置</span>
                  </button>

                  <button className={`${styles.menuItem} ${styles.appearanceItem}`} type="button" onClick={toggleTheme} aria-label="切换外观">
                    <span className={styles.themeCurrentIcon} aria-hidden="true">
                      {theme === "light" ? <Sun /> : <Moon />}
                    </span>
                    <span>{theme === "light" ? "浅色模式" : "深色模式"}</span>
                    <span className={`${styles.themeSwitch} ${theme === "dark" ? styles.themeSwitchDark : ""}`} aria-hidden="true">
                      <span className={styles.themeThumb} />
                      <Sun />
                      <Moon />
                    </span>
                  </button>

                  <div className={`${styles.helpSection} ${helpOpen ? styles.helpOpen : ""}`}>
                    <button
                      className={`${styles.menuItem} ${styles.helpTrigger}`}
                      ref={helpTriggerRef}
                      type="button"
                      aria-expanded={helpOpen}
                      aria-controls="workspace-profile-help"
                      onClick={() => setHelpOpen(true)}
                      onPointerEnter={() => setHelpOpen(true)}
                    >
                      <CircleHelp aria-hidden="true" />
                      <span>帮助中心</span>
                      <ChevronRight aria-hidden="true" />
                    </button>

                    <div className={styles.helpPanel} id="workspace-profile-help">
                      <ShortcutHelp />
                      <a className={styles.helpLink} href={manualUrl} target="_blank" rel="noopener noreferrer">
                        <BookOpenCheck aria-hidden="true" />
                        <span>使用教程</span>
                      </a>
                      <a className={styles.helpLink} href={feedbackUrl} target="_blank" rel="noopener noreferrer">
                        <SendHorizontal aria-hidden="true" />
                        <span>反馈问题</span>
                      </a>
                    </div>
                  </div>

                  <Form method="post" action={routePaths.logout()}>
                    <button className={`${styles.menuItem} ${styles.signOut}`} type="submit">
                      <LogOut aria-hidden="true" />
                      <span>退出账号</span>
                    </button>
                  </Form>
                </div>
              </div>
            </details>
          </div>
        ) : null}
      </header>
      {showAccount ? (
        <AccountSettingsDialog
          actor={actor}
          initialSection={accountSettingsSection}
          workspace={currentWorkspace}
          open={accountSettingsOpen}
          onClose={() => setAccountSettingsOpen(false)}
        />
      ) : null}
    </>
  );
}
