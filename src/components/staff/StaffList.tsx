
"use client";

import type { Staff } from "@/components/staff/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils"
import { masterListShellCn, masterListRowUnselectedCn } from "@/lib/masterListChrome";
import { masterListNameTriggerCn } from "@/lib/listSelectionChrome";
import { useDate } from "@/hooks/useDate";
import { useMasterListRowMotion } from "@/hooks/useMasterListRowMotion";
import { MasterListRow } from "@/components/ui/master-list-row";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Briefcase } from "lucide-react";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ResolvedEntityAvatar } from "@/components/entity/ResolvedEntityAvatar";
import { EntityFileAttachmentHover } from "@/components/entity/EntityFileAttachmentHover";
import { trimEntityFileUrlForPreview } from "@/lib/trimEntityFileUrlForPreview";
import {
  EntityListQuickFilterBar,
  type EntityListQuickFilter,
} from "@/components/entity/EntityListQuickFilterBar";

const getInitials = (name: string) => {
  if (!name) return "NA";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
};

export function StaffList({
  staff,
  selectedStaff,
  onSelectStaff,
  searchTerm,
  pendingApprovalByStaffId = {},
  getItemHref,
  quickFilter: quickFilterProp,
  onQuickFilterChange,
  hideQuickFilterBar = false,
}: {
  staff: Staff[];
  selectedStaff: Staff | null;
  onSelectStaff: (staff: Staff) => void;
  searchTerm: string;
  /** Pending approval count per staff id (only when approve notifications on list). */
  pendingApprovalByStaffId?: Record<string, number>;
  /** When provided, use Link for navigation (mobile/Capacitor) */
  getItemHref?: (staff: Staff) => string | undefined;
  quickFilter?: EntityListQuickFilter;
  onQuickFilterChange?: (next: EntityListQuickFilter) => void;
  hideQuickFilterBar?: boolean;
}) {
  const { formatCurrency } = useDate();
  const [internalQuickFilter, setInternalQuickFilter] = useState<EntityListQuickFilter>("default");
  const quickFilter = quickFilterProp ?? internalQuickFilter;
  const setQuickFilter = onQuickFilterChange ?? setInternalQuickFilter;
  const { animatePresenceMode, rowMotionProps, markListScrolling } = useMasterListRowMotion();
  const filteredAndSortedStaff = useMemo(() => {
    const toDateMs = (raw: unknown): number => {
      if (!raw) return 0;
      if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? 0 : raw.getTime();
      if (typeof (raw as { toDate?: () => Date }).toDate === "function") {
        const d = (raw as { toDate: () => Date }).toDate();
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      }
      const d = new Date(raw as any);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const isSettled = (bal: number) => Math.abs(Number(bal || 0)) < 1e-6;
    return staff
      .filter((s) => {
        if (!s.name || !s.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        const bal = Number(s.balance || 0);
        // Footer quick filters: list short/filter from same control on mobile + desktop.
        if (quickFilter === "dr") return bal > 0;
        if (quickFilter === "cr") return bal < 0;
        if (quickFilter === "settled") return isSettled(bal);
        if (quickFilter === "non_settled") return !isSettled(bal);
        return true;
      })
      .sort((a, b) => {
        if (quickFilter === "name") return String(a.name || "").localeCompare(String(b.name || ""));
        if (quickFilter === "date") return toDateMs(b.openingBalanceDate) - toDateMs(a.openingBalanceDate);
        return Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0));
      });
  }, [staff, searchTerm, quickFilter]);


  return (
    <div className={masterListShellCn}>
      <ScrollArea
        listChrome
        className="min-h-0 min-w-0 flex-1"
        onViewportScroll={markListScrolling}
        onViewportTouchMove={markListScrolling}
      >
        <ul className="pl-master-list-ul">
          <AnimatePresence mode={animatePresenceMode}>
            {filteredAndSortedStaff.map((staffMember) => {
              const isSelected = selectedStaff?.id === staffMember.id;
              const href = getItemHref?.(staffMember);
              /** List hover + avatar: stale `"null"` string par PDF spinner na kholo — `trimEntityFileUrlForPreview` */
              const attachmentPreviewUrl = trimEntityFileUrlForPreview(staffMember.fileUrl);
              const cardClassName = masterListRowUnselectedCn(isSelected);
              const cardContent = (
                <div className="pl-master-list-row">
                  <div className="pl-master-list-row-leading">
                    <div className="relative flex-shrink-0">
                      <EntityFileAttachmentHover
                        fileUrl={attachmentPreviewUrl}
                        triggerClassName="inline-flex shrink-0 rounded-full"
                      >
                        <ResolvedEntityAvatar
                          className="h-8 w-8 text-xs"
                          src={attachmentPreviewUrl ?? undefined}
                          alt={staffMember.name}
                          fallbackSlot={<Briefcase className="h-4 w-4 text-muted-foreground" />}
                        />
                      </EntityFileAttachmentHover>
                      {(pendingApprovalByStaffId[staffMember.id] ?? 0) > 0 && (
                        <span
                          className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-pink-500 text-white text-[10px] font-bold origin-center"
                          style={{ transform: "rotate(45deg) translate(25%, -25%)" }}
                          aria-label={`${pendingApprovalByStaffId[staffMember.id]} pending approval`}
                        >
                          <span style={{ transform: "rotate(-45deg)" }}>{pendingApprovalByStaffId[staffMember.id]}</span>
                        </span>
                      )}
                    </div>
                    <Tooltip>
                      {/* asChild hata — motion layout + span ref merge par Radix setRef loop */}
                      <TooltipTrigger
                        type="button"
                        data-pl-list-name=""
                        onPointerDown={(e) => e.stopPropagation()}
                        className={masterListNameTriggerCn}
                      >
                        {staffMember.name}
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{staffMember.name}</p>
                        {(pendingApprovalByStaffId[staffMember.id] ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">{pendingApprovalByStaffId[staffMember.id]} pending approval</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className={cn(
                    "pl-master-list-row-amount ml-2",
                    staffMember.balance >= 0 ? "text-green-600" : "text-red-600",
                    isSelected && (staffMember.balance >= 0 ? "text-green-800" : "text-red-800")
                  )}>
                    {formatCurrency(staffMember.balance, { showDrCr: true, context: 'list' })}
                  </p>
                </div>
              );
              return (
                <motion.li key={staffMember.id} {...rowMotionProps}>
                  {href ? (
                    // Master list navigation: per-row auto-prefetch off rakho to avoid repeat background bursts on revisit.
                    <Link
                      prefetch={false}
                      href={href}
                      onClick={() => onSelectStaff(staffMember)}
                      className="block min-w-0 max-w-full overflow-hidden"
                    >
                      <MasterListRow selected={isSelected} className={cardClassName}>{cardContent}</MasterListRow>
                    </Link>
                  ) : (
                    <MasterListRow selected={isSelected} className={cardClassName} onClick={() => onSelectStaff(staffMember)}>
                      {cardContent}
                    </MasterListRow>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
          {filteredAndSortedStaff.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              No staff members found.
            </div>
          )}
        </ul>
      </ScrollArea>
      {!hideQuickFilterBar ? (
        <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />
      ) : null}
    </div>
  );
};
