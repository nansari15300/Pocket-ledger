import { ADMIN_PANEL_ITEM_GROUP_LIST_CONFIG } from "@/lib/adminPanelCompany/adminPanelItemGroupListConfig";
import { isAdminPanelCompanyLocalId } from "@/lib/adminPanelCompany/ledgerMode";
import { ITEM_GROUP_LIST_CONFIG } from "@/lib/masterGroupListConfigs";
import type { MasterGroupListConfig } from "@/lib/masterGroupListTree";

export function resolveItemGroupListConfigForCompany(
  companyId: string | null | undefined
): MasterGroupListConfig {
  return isAdminPanelCompanyLocalId(companyId)
    ? ADMIN_PANEL_ITEM_GROUP_LIST_CONFIG
    : ITEM_GROUP_LIST_CONFIG;
}
