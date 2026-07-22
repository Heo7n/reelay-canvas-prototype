import { AlertTriangle, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import styles from "./system-pages.module.css";

export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className={styles.page}>
      <AlertTriangle aria-hidden="true" />
      <h1>{notFound ? "没有找到这个项目" : "页面暂时无法加载"}</h1>
      <p>{notFound ? "项目可能已被移除，或当前账号没有访问权限。" : "请检查本地共享服务是否正在运行。"}</p>
      <button type="button" onClick={() => window.location.reload()}>
        <RotateCcw aria-hidden="true" />
        重新加载
      </button>
    </main>
  );
}
