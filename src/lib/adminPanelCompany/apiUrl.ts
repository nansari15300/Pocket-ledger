import { webAppBasePath } from "@/lib/webAppBasePath";

/** Admin Panel Company APIs under Next `basePath` `/app` (gateway/dev). */
export function adminPanelCompanyApiUrl(apiPath: string): string {
  const path = String(apiPath || "").startsWith("/") ? String(apiPath) : `/${String(apiPath || "")}`;
  return `${webAppBasePath()}${path}`;
}
