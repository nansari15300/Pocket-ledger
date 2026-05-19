"use client";

/**
 * Inter Company — New Trxn dialog me same UI (default tab inter_company).
 */
import { useState } from "react";
import { AddVoucherDialog } from "@/components/vouchers/AddVoucherDialog";
import { useCompany } from "@/hooks/useCompany";
import { Loader2 } from "lucide-react";

export default function InterCompanyPage() {
  const { companyId, loading } = useCompany();
  const [open, setOpen] = useState(true);

  if (loading && !companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-center text-muted-foreground">
        Select a company to create inter-company transactions.
      </div>
    );
  }

  return (
    <AddVoucherDialog
      isOpen={open}
      onOpenChange={setOpen}
      defaultTab="inter_company"
      onVoucherAction={() => setOpen(false)}
    />
  );
}
