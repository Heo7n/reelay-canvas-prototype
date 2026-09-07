/** Remove Vercel rewrite metadata before application query validation. */
export function normalizeVercelApiUrl(requestUrl = "/api"): string {
  const url = new URL(requestUrl, "http://localhost");
  if (!url.searchParams.has("apiPath")) return requestUrl;
  const apiPath = url.searchParams.get("apiPath");
  url.searchParams.delete("apiPath");
  // Vercel may preserve the public pathname or provide only the rewrite target.
  const pathname = url.pathname === "/api" && apiPath
    ? `/api/${apiPath.replace(/^\/+/, "")}`
    : url.pathname;
  const search = url.searchParams.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}
