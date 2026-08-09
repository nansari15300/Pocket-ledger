"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import usePermissions, {
  type UserRole,
  roleCanPermission,
} from "@/hooks/usePermissions";
import { useCompany } from "@/hooks/useCompany";
import { PermissionGroups } from "@/lib/permissions";
import { companyShareRoleLabel } from "@/lib/localCompanyAppRoles";
import { resolvePermissionConfigSource } from "@/lib/permissionConfigSource";
import { cn } from "@/lib/utils";

type MyRoleButtonProps = {
  className?: string;
  /** When set (and user can open Role Permissions), show jump action. */
  onJumpToEditor?: (role: UserRole) => void;
};

/** Read-only assigned role — always available from Settings header (not behind Manage Sharing). */
export function MyRoleButton({ className, onJumpToEditor }: MyRoleButtonProps) {
  const { company } = useCompany();
  const {
    can,
    role: myAssignedRole,
    dateLimits: myDateLimits,
    fileAttachmentLimits: myFileLimits,
    allowAttachments: myAllowAttachments,
    permissionConfig: livePermissionConfig,
    permissionConfigSource,
    permissionConfigSourceKey,
  } = usePermissions();
  const [open, setOpen] = useState(false);

  if (!company) return null;

  const source = permissionConfigSource || resolvePermissionConfigSource(company);
  const showJump = Boolean(onJumpToEditor) && can("manage_users_roles");

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={cn("h-7 shrink-0 px-2.5 text-xs", className)}
        onClick={() => setOpen(true)}
      >
        My Role
        <span className="ml-1.5 font-semibold text-primary">
          {companyShareRoleLabel(myAssignedRole)}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[min(100vw-1.5rem,80vw)] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Role (read-only)</DialogTitle>
            <DialogDescription>
              Permissions this login actually uses for vouchers and app screens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-1 rounded-lg border p-3">
              <p>
                <span className="font-semibold">Assigned role:</span>{" "}
                {companyShareRoleLabel(myAssignedRole)}
              </p>
              <p>
                <span className="font-semibold">Provider:</span> {source.label}
              </p>
              <p className="break-all">
                <span className="font-semibold">Source URL:</span> {source.url}
              </p>
              <p className="text-xs text-muted-foreground">
                Config load path: {permissionConfigSourceKey || "—"}
                {permissionConfigSourceKey === "initial-default"
                  ? " (host permissionConfig missing on client — defaults like manager editDays=7)"
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">{source.detail}</p>
            </div>
            <div className="space-y-2">
              <h4 className="border-b pb-1 font-semibold">Date Control</h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["Entry", myDateLimits?.entryDays],
                    ["Edit", myDateLimits?.editDays],
                    ["Delete", myDateLimits?.deleteDays],
                  ] as const
                ).map(([label, days]) => (
                  <div key={label} className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">Back Date {label}</div>
                    <div className="font-semibold">{days ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="border-b pb-1 font-semibold">File Attachments</h4>
              <p>Allow attachments: {myAllowAttachments ? "ON" : "OFF"}</p>
              <p>Max files: {myFileLimits?.maxFileCount ?? 0}</p>
              <p>
                Image: {myFileLimits?.allowImage ? "ON" : "OFF"} · PDF:{" "}
                {myFileLimits?.allowPDF ? "ON" : "OFF"} · Delete:{" "}
                {myFileLimits?.allowDelete ? "ON" : "OFF"}
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="border-b pb-1 font-semibold">Permissions</h4>
              {PermissionGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{group.title}</p>
                  <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {group.permissions.map((perm) => {
                      const on = roleCanPermission(
                        myAssignedRole,
                        perm.key,
                        livePermissionConfig
                      );
                      return (
                        <li key={perm.key} className="flex min-w-0 items-center gap-2">
                          <Checkbox checked={on} disabled />
                          <span className={cn("truncate", on ? "" : "text-muted-foreground")}>
                            {perm.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            {showJump ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onJumpToEditor?.(myAssignedRole);
                  setOpen(false);
                }}
              >
                Jump editor to my role
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
