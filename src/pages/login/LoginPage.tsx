import { useLocation, useOutletContext } from "react-router-dom";

import { routePaths } from "../../app/routes";
import type { PublicEntryContext } from "../home/PublicEntryPage";
import { LoginDialog } from "./LoginDialog";

export function LoginPage() {
  const { search } = useLocation();
  const { closeLogin, prepareLogin } = useOutletContext<PublicEntryContext>();

  return <LoginDialog action={`${routePaths.login()}${search}`} onClose={closeLogin} onBeforeSubmit={prepareLogin} />;
}
