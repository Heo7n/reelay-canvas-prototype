import { Brand } from "../../shared/ui/Brand";
import styles from "./HomeFooter.module.css";

export function HomeFooter({ homePath }: { homePath: string }) {
  return (
    <footer className={styles.footer} aria-label="平台信息">
      <div className={styles.about}>
        <Brand className={styles.brand} to={homePath} />
        <p>面向团队的 AI 图像与视频创作平台。</p>
        <small>© {new Date().getFullYear()} Reelay 立画</small>
      </div>
      <div className={styles.column}>
        <h2>平台协议</h2>
        <button type="button" disabled title="使用条款暂未开放">使用条款</button>
        <button type="button" disabled title="隐私政策暂未开放">隐私政策</button>
      </div>
      <div className={styles.column}>
        <h2>联系与帮助</h2>
        <a href="mailto:customerservice@reelay.studio">customerservice@reelay.studio</a>
        <a href="https://reelay.tech.jetsentv.com/manual" target="_blank" rel="noopener noreferrer">使用帮助</a>
      </div>
    </footer>
  );
}
