
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EditCompanyForm } from "./EditCompanyForm";

export function CompanySettingsDialog({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Company Settings</DialogTitle>
          <DialogDescription>
            Update your company profile and fiscal year information.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <EditCompanyForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
