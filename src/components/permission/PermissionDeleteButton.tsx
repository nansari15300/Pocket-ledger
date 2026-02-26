"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import usePermissions from "@/hooks/usePermissions";

const NO_PERMISSION_MSG = "No permission";

/** Use for delete-to-recycle-bin actions. For permanent delete, use permission="permanently_delete_records" via PermissionButton. */
export type PermissionDeleteButtonProps = ButtonProps & {
  forceDisabled?: boolean;
};

export function PermissionDeleteButton({
  forceDisabled = false,
  disabled,
  onClick,
  children,
  ...rest
}: PermissionDeleteButtonProps) {
  const { can } = usePermissions();
  const allowed = can("delete_records");
  const isDisabled = forceDisabled || disabled || !allowed;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick?.(e);
  };

  const button = (
    <Button disabled={isDisabled} onClick={handleClick} {...rest}>
      {children}
    </Button>
  );

  if (isDisabled && !forceDisabled && !disabled) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{NO_PERMISSION_MSG}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
