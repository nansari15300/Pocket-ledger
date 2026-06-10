"use client";

import { Suspense } from "react";
import { GatePageContent } from "@/components/gates/GatePageContent";
import { Loader2 } from "lucide-react";

function GatePageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function GatePage() {
  return (
    <Suspense fallback={<GatePageFallback />}>
      <GatePageContent />
    </Suspense>
  );
}
