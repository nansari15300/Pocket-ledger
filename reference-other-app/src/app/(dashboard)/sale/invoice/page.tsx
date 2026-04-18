'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// This page is a redirect to avoid routing conflicts with the dynamic [id] route.
export default function SaleInvoiceIndexRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/sale');
    }, [router]);
    return null;
}
