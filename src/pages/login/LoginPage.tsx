import { useLocation, useOutletContext } from "react-router-dom";

import { routePaths } from "../../app/routes";
import type { PublicEntryContext } from "../home/PublicEntryPage";
import { LoginDialog } from "./LoginDialog";
import { getDemoLoginPreset } from "./demo-login-preset";

export function LoginPage() {
  const { search } = useLocation();
  const { closeLogin, prepareLogin } = useOutletContext<PublicEntryContext>();

  return <LoginDialog action={`${routePaths.login()}${search}`} defaultAccount={getDemoLoginPreset(search).account}
    onClose={closeLogin} onBeforeSubmit={prepareLogin} />;
}
