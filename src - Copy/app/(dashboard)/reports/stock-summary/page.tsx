
"use client";

import StockSummary from "@/components/reports/StockSummary";
import { useIsMobile } from "@/hooks/use-mobile";

export default function StockSummaryPage() {
    const isMobile = useIsMobile();
    
    return <StockSummary />;
}

