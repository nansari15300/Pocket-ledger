import { appApiUrl } from "@/lib/webAppBasePath";

/** Admin Panel Company APIs under Next `basePath` `/app` (gateway/dev). */
export function adminPanelCompanyApiUrl(apiPath: string): string {
  return appApiUrl(apiPath);
}
