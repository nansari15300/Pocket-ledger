import type { MasterGroupListConfig } from "@/lib/masterGroupListTree";
import {
  ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID,
  ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_NAME,
  ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID,
  ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_NAME,
} from "@/lib/adminPanelCompany/subscriptionCatalogItemPricing";

/** Admin Panel Company items list — Plans vs Add-ons (not Stock Items / Services). */
export const ADMIN_PANEL_ITEM_GROUP_LIST_CONFIG: MasterGroupListConfig = {
  sysExpandPrefix: "ap-item-sys:",
  grpExpandPrefix: "ap-item-grp:",
  branches: [
    {
      id: ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID,
      name: ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_NAME,
      rootParentIds: [ADMIN_PANEL_SUBSCRIPTION_PLAN_GROUP_ID],
    },
    {
      id: ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID,
      name: ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_NAME,
      rootParentIds: [ADMIN_PANEL_SUBSCRIPTION_ADDON_GROUP_ID],
    },
  ],
};
