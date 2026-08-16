"use client";

import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  FileDigit,
  FileText,
  Landmark,
  ShoppingBag,
  ShoppingCart,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AdminPanelQuickAction } from "@/lib/adminPanelCompany/events";

const BUTTON_CLASS = "whitespace-nowrap flex-grow min-w-fit";

const QUICK_ACTIONS: Array<{
  label: string;
  action: AdminPanelQuickAction;
  icon: typeof ShoppingBag;
  theme: string;
}> = [
  { label: "Add Sale", action: { kind: "voucher", tab: "sale" }, icon: ShoppingBag, theme: "add-sale" },
  {
    label: "Add Purchase",
    action: { kind: "voucher", tab: "purchase" },
    icon: ShoppingCart,
    theme: "add-purchase",
  },
  {
    label: "Payment In",
    action: { kind: "voucher", tab: "payment_in" },
    icon: ArrowRight,
    theme: "payment-in",
  },
  {
    label: "Payment Out",
    action: { kind: "voucher", tab: "payment_out" },
    icon: ArrowLeft,
    theme: "payment-out",
  },
  { label: "Journal", action: { kind: "voucher", tab: "journal" }, icon: FileText, theme: "journal" },
  {
    label: "Add Salary",
    action: { kind: "voucher", tab: "add_salary" },
    icon: FileDigit,
    theme: "add-salary",
  },
  { label: "Add Party", action: { kind: "party" }, icon: Users, theme: "add-party" },
  { label: "Add Bank", action: { kind: "bank" }, icon: Landmark, theme: "add-bank" },
  { label: "Add Staff", action: { kind: "staff" }, icon: Briefcase, theme: "add-staff" },
];

/**
 * Same layout as DesktopAppHeader HeaderActions: fragment of pills
 * that open isolated Admin Panel Company dialogs.
 */
export function AdminPanelHeaderQuickActions({
  onAction,
}: {
  onAction: (action: AdminPanelQuickAction) => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <>
      {QUICK_ACTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.theme}
            type="button"
            variant="chromePill"
            size="sm"
            className={BUTTON_CLASS}
            data-theme-btn={item.theme}
            onClick={() => onAction(item.action)}
          >
            <Icon className="mr-1 h-4 w-4" />
            {item.label}
          </Button>
        );
      })}
    </>
  );
}
