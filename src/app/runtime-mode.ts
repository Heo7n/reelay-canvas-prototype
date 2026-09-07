// Chosen by the build, never by a query parameter or the authenticated account.
export const isExperienceRuntime = import.meta.env.VITE_REELAY_EXPERIENCE === "true";
