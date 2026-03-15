
"use client";

import { Suspense } from "react";
import DesktopPartyStatementPage from "@/components/reports/DesktopPartyStatementPage";

function PartyStatementLoading() {
    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
                <p className="mt-4 text-muted-foreground">Loading statement...</p>
            </div>
        </div>
    );
}

export default function PartyStatementPage() {
    return (
        // Keep child route content in Suspense because statement UI reads URL query params.
        <Suspense fallback={<PartyStatementLoading />}>
            <DesktopPartyStatementPage />
        </Suspense>
    );
}
