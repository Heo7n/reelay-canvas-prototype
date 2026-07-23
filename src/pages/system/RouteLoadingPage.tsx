import styles from "./system-pages.module.css";

export function RouteLoadingPage() {
  return (
    <main className={styles.page} aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <p>正在连接 Reelay 工作空间…</p>
    </main>
  );
}
