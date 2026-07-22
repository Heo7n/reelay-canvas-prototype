import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="app-runtime-shell">
      <Outlet />
    </div>
  );
}
