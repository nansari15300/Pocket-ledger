
"use client";

import React, { useMemo, useState, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVouchers } from "@/hooks/useVouchers";
import { useDate } from "@/hooks/useDate";
import { useCompany } from "@/hooks/useCompany";
import { openPrintDirect } from "@/lib/printDirect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Item as ItemType } from "@/components/items/types";

type StockItem = {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    value: number;
    type: 'item' | 'service' | 'finished_good';
};

const StockTable = ({ items, totalValue, formatCurrency }: { items: StockItem[], totalValue: number, formatCurrency: any }) => (
    <div className="border rounded-lg">
        <ScrollArea className="h-[calc(100vh-24rem)]">
            <Table>
                <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item) => (
                        <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right">{item.quantity.toFixed(2)} {item.unit}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.rate, { noSuffix: true })}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(item.value, { noSuffix: true })}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>
        <Table>
             <TableFooter>
                <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold text-lg">Total Stock Value</TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(totalValue, { noSuffix: true })}</TableCell>
                </TableRow>
            </TableFooter>
        </Table>
    </div>
);


export default function StockSummary() {
    const { processedItems, loading } = useVouchers();
    const { company } = useCompany();
    const { formatCurrency, dateSystem, formatDate, formatDateBS } = useDate();
    const [activeTab, setActiveTab] = useState<'item' | 'service'>('item');
    const printRef = useRef(null);

    const stockSummaryData = useMemo(() => {
        const physicalItems: StockItem[] = [];
        const serviceItems: StockItem[] = [];

        processedItems.forEach((item: ItemType) => {
            const stockItem: StockItem = {
                id: item.id,
                name: item.name,
                quantity: item.stockQty || 0,
                unit: (item.unitConversions?.[item.unitConversions.length - 1] as any)?.toUnit || (item as any).openingBalanceUnit || 'N/A',
                rate: item.purchasePrice || 0,
                value: (item.stockQty || 0) * (item.purchasePrice || 0),
                type: item.type,
            };

            if (item.type === 'item' || item.type === 'finished_good') {
                physicalItems.push(stockItem);
            } else {
                serviceItems.push(stockItem);
            }
        });
        
        const totalItemValue = physicalItems.reduce((sum, item) => sum + item.value, 0);
        const totalServiceValue = serviceItems.reduce((sum, item) => sum + item.value, 0);

        return { physicalItems, serviceItems, totalItemValue, totalServiceValue };

    }, [processedItems]);

    const handlePrint = () => {
        if (!company) return;

        const { physicalItems, serviceItems, totalItemValue, totalServiceValue } = stockSummaryData;
        const itemsToPrint = activeTab === 'item' ? physicalItems : serviceItems;
        const totalToPrint = activeTab === 'item' ? totalItemValue : totalServiceValue;

        const body: any[] = [
            [{ text: 'Item Name', bold: true }, { text: 'Quantity', bold: true, alignment: 'right' }, { text: 'Rate', bold: true, alignment: 'right' }, { text: 'Value', bold: true, alignment: 'right' }]
        ];

        itemsToPrint.forEach(item => {
            body.push([
                item.name,
                { text: `${item.quantity.toFixed(2)} ${item.unit}`, alignment: 'right' },
                { text: formatCurrency(item.rate, { noSuffix: true, noAnimation: true }), alignment: 'right' },
                { text: formatCurrency(item.value, { noSuffix: true, noAnimation: true }), alignment: 'right', bold: true }
            ]);
        });
        
        body.push([
            { text: 'Total Stock Value', colSpan: 3, alignment: 'right', bold: true, fontSize: 12, margin: [0, 5, 0, 5] },
            {}, {},
            { text: formatCurrency(totalToPrint, { noSuffix: true, noAnimation: true }), alignment: 'right', bold: true, fontSize: 12, margin: [0, 5, 0, 5] }
        ]);


        openPrintDirect({
            company: {
                name: company.name,
                pan: company.pan,
                phone: company.phone,
                address: company.address,
                logoUrl: company.logoUrl,
            },
            title: `Stock Summary (${activeTab === 'item' ? 'Items' : 'Services'})`,
            dateSystem,
            dateRangeText: `As of ${formatDateBS(new Date())} / ${formatDate(new Date())}`,
            transactions: [],
            openingBalance: 0,
            vouchersCount: 0,
            context: 'daybook',
            customContent: [{
                table: {
                    headerRows: 1,
                    widths: ['*', 'auto', 'auto', 'auto'],
                    body
                },
                layout: 'lightHorizontalLines'
            }]
        }, true);
    };

    return (
        <div className="p-4 sm:p-6 md:p-8 space-y-4">
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <div>
                        <CardTitle>Stock Summary</CardTitle>
                        <CardDescription>Overview of your item and service stock levels and values.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'item' | 'service')} className="w-full">
                        <TabsList>
                            <TabsTrigger value="item">Items</TabsTrigger>
                            <TabsTrigger value="service">Services</TabsTrigger>
                        </TabsList>
                        <div ref={printRef}>
                            <TabsContent value="item" className="mt-4">
                                <StockTable items={stockSummaryData.physicalItems} totalValue={stockSummaryData.totalItemValue} formatCurrency={formatCurrency} />
                            </TabsContent>
                            <TabsContent value="service" className="mt-4">
                                <StockTable items={stockSummaryData.serviceItems} totalValue={stockSummaryData.totalServiceValue} formatCurrency={formatCurrency} />
                            </TabsContent>
                        </div>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
