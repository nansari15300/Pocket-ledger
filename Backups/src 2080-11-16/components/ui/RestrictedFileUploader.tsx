
"use client";

import React from "react";
import { useCompany } from "@/hooks/useCompany";
import usePermissions from "@/hooks/usePermissions";
import Link from "next/link";
import { Lock, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface RestrictedFileUploaderProps {
  children: React.ReactNode;
}

export const RestrictedFileUploader: React.FC<RestrictedFileUploaderProps> = ({ 
  children,
}) => {
  const { company, loading } = useCompany();
  const { allowAttachments, fileAttachmentLimits, canAddFileImagePdf } = usePermissions();

  if (loading) return <div className="h-20 w-full bg-muted animate-pulse rounded-md" />;

  // Check permission-based attachment settings (plan first, then role)
  if (!allowAttachments || fileAttachmentLimits.maxFileCount === 0) {
    const blockedByPlan = !canAddFileImagePdf;
    return (
      <div className={cn(
        "border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 flex flex-col items-center justify-center text-center bg-muted/30 gap-2 relative overflow-hidden"
      )}>
        <div className="p-3 bg-red-100 rounded-full mb-1">
            <Lock className="w-5 h-5 text-red-500" />
        </div>
        
        <h3 className="font-semibold text-sm">Attachments Disabled</h3>
        
        <p className="text-xs text-muted-foreground max-w-[250px]">
          {blockedByPlan ? (
            <>
              Upgrade your plan to attach files (image/PDF) to vouchers.{" "}
              <Link href="/billing" className="text-primary underline font-medium hover:no-underline">
                Click here to upgrade
              </Link>
            </>
          ) : (
            "File attachments are not allowed for your role."
          )}
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
