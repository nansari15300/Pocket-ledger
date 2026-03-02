"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface DisclaimerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DisclaimerDialog({ isOpen, onClose }: DisclaimerDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center mb-4">
            <AlertTriangle className="h-16 w-16 text-yellow-500" />
          </div>
          <AlertDialogTitle className="text-center text-2xl">
            Important Notice for Test Users
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-center text-base py-4 space-y-4">
              <div>
                This application is for <strong>testing purposes only</strong>. Please do not
                use it for production or with real business data.
              </div>
              <div className="font-bold text-destructive">
                Your data may be deleted at any time without prior information.
              </div>
              <div>
                It is strongly recommended that you{" "}
                <Link href="/backup" className="text-primary underline" onClick={onClose}>
                  backup your data
                </Link>{" "}
                to a safe location.
              </div>
              <div className="text-sm">
                For any questions, contact:{" "}
                <a href="mailto:webpocketledger@gmail.com" className="font-semibold text-primary">
                  webpocketledger@gmail.com
                </a>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose} className="w-full">
            I Understand and Acknowledge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
