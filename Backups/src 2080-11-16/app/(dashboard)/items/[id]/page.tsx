
'use client';

import { useParams } from 'next/navigation';
import DesktopItemDetails from '@/components/items/ItemDetails';
import { useVouchers } from '@/hooks/useVouchers';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/layout/LoadingSpinner';
import type { StockView } from '@/components/items/ItemDetails';
import { useIsMobile } from '@/hooks/use-mobile';


export default function ItemDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { processedItems, loading, vouchers } = useVouchers();
  const [stockView, setStockView] = useState<StockView>('amount');
  const [itemDisplayUnits, setItemDisplayUnits] = useState<Record<string, string>>({});
  const isMobile = useIsMobile();


  const itemId = params.id as string;

  const item = processedItems.find((p) => p.id === itemId);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>Item not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <DesktopItemDetails
        item={item}
        onItemUpdated={() => {}}
        onItemDeleted={() => router.push('/items')}
        stockView={stockView}
        setStockView={setStockView}
        itemDisplayUnits={itemDisplayUnits}
        setItemDisplayUnit={(itemId: string, unit: string) => setItemDisplayUnits(prev => ({...prev, [itemId]: unit}))}
        onBack={() => router.push(`/items?selected=${encodeURIComponent(itemId)}`)}
        transactions={vouchers}
      />
    </div>
  );
}


