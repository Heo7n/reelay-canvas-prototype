import { Outlet } from "react-router-dom";

export function AppShell({ experience = false }: { experience?: boolean }) {
  return (
    <div className={`app-runtime-shell${experience ? " experience-runtime-shell" : ""}`}>
      {experience ? <div className="experience-notice" role="note">
        <strong>体验版</strong>
        <span>修改仅本次有效，刷新后重置</span>
        <span className="experience-notice-detail">生成与积分为演示</span>
      </div> : null}
      {experience ? <div className="experience-content"><Outlet /></div> : <Outlet />}
    </div>
  );
}
