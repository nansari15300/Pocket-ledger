
"use client";

import { useIsMobile } from "@/hooks/use-mobile";

export default function IncomeStatementPage() {
    const isMobile = useIsMobile();
    
    // return <DesktopIncomeStatementPage />;
    return <div>Income Statement Page</div>;
}
