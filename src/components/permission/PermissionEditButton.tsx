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

export type PermissionEditButtonProps = ButtonProps & {
  isOwnRecord: boolean;
  forceDisabled?: boolean;
};

export function PermissionEditButton({
  isOwnRecord,
  forceDisabled = false,
  disabled,
  onClick,
  children,
  ...rest
}: PermissionEditButtonProps) {
  const { canEditRecord } = usePermissions();
  const allowed = canEditRecord(isOwnRecord);
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
