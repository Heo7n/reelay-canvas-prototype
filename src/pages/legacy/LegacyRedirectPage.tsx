import { useEffect } from "react";

interface LegacyRedirectPageProps {
  to: string;
  label: string;
}

export function LegacyRedirectPage({ to, label }: LegacyRedirectPageProps) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return <p className="legacy-route-status">正在进入{label}…</p>;
}
