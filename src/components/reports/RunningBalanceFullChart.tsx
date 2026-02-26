
"use client";

import * as React from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useDate } from "@/hooks/useDate";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format as formatDateFns, eachDayOfInterval, startOfDay } from "date-fns";

type Transaction = {
  date: any;
  balance: number;
  debit: number;
  credit: number;
};

interface RunningBalanceFullChartProps {
  transactions: Transaction[];
  openingBalance: number;
}

export function RunningBalanceFullChart({
  transactions,
  openingBalance,
}: RunningBalanceFullChartProps) {
  const { formatDate, formatDateBS, formatCurrency, formatCurrencyForPrint } = useDate();
  const isMobile = useIsMobile();
  const labelAngle = 65;

  const chartData = React.useMemo(() => {
    if (transactions.length === 0) return [];

    const start = transactions[0].date.toDate();
    const end = transactions[transactions.length - 1].date.toDate();
    const allDays = eachDayOfInterval({ start, end });

    const dataMap = new Map<string, { balance: number; debit: number; credit: number }>();
    
    let runningBalance = openingBalance;
    transactions.forEach((t) => {
        const day = startOfDay(t.date.toDate()).toISOString().split('T')[0];
        runningBalance = t.balance;
        const current = dataMap.get(day) || { balance: 0, debit: 0, credit: 0 };
        current.balance = runningBalance;
        current.debit += t.debit;
        current.credit += t.credit;
        dataMap.set(day, current);
    });

    let lastKnownBalance = openingBalance;
    return allDays.map(day => {
        const dayString = day.toISOString().split('T')[0];
        if (dataMap.has(dayString)) {
            const data = dataMap.get(dayString)!;
            lastKnownBalance = data.balance;
            return {
                date: dayString,
                balance: data.balance,
                debit: data.debit,
                credit: data.credit,
            };
        } else {
            return {
                date: dayString,
                balance: lastKnownBalance,
                debit: 0,
                credit: 0,
            };
        }
    });

  }, [transactions, openingBalance]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border p-1.5 rounded shadow-lg text-[10px] leading-tight min-w-0 max-w-[140px]">
          <p className="font-bold text-[10px]">{formatDate(new Date(label))}</p>
          <p className="text-primary text-[9px]">Balance: {formatCurrencyForPrint(data.balance, { showDrCr: true })}</p>
          <p className="text-green-600 text-[9px]">Debit: {formatCurrencyForPrint(data.debit, { noSuffix: true })}</p>
          <p className="text-red-600 text-[9px]">Credit: {formatCurrencyForPrint(data.credit, { noSuffix: true })}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader className="p-0">
        <CardTitle>Running Balance Chart</CardTitle>
        <CardDescription>
          Visual representation of the party's balance and transactions over time.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-[500px] w-full max-w-full p-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: -10, left: -10, bottom: isMobile ? 80 : 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(dateStr) => formatDateBS(new Date(dateStr))}
              minTickGap={isMobile ? 12 : 20}
              tick={{ textAnchor: "end", fontSize: isMobile ? 9 : 10 }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              width={55}
              stroke="#8884d8"
              tickFormatter={(value) => formatCurrencyForPrint(value, { noSuffix: true })}
              tick={({ x, y, payload }) => {
                const val = payload?.value ?? payload;
                return (
                  <text x={x} y={y} transform={`rotate(${-labelAngle}, ${x}, ${y})`} textAnchor="end" fontSize={isMobile ? 9 : 10} fill="currentColor">
                    {typeof val === "number" ? formatCurrencyForPrint(val, { noSuffix: true }) : String(val)}
                  </text>
                );
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={55}
              stroke="#82ca9d"
              tickFormatter={(value) => formatCurrencyForPrint(value, { noSuffix: true })}
              tick={({ x, y, payload }) => {
                const val = payload?.value ?? payload;
                return (
                  <text x={x} y={y} transform={`rotate(${labelAngle}, ${x}, ${y})`} textAnchor="start" fontSize={isMobile ? 9 : 10} fill="currentColor">
                    {typeof val === "number" ? formatCurrencyForPrint(val, { noSuffix: true }) : String(val)}
                  </text>
                );
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="right" dataKey="debit" fill="#4CAF50" name="Debit" barSize={20} />
            <Bar yAxisId="right" dataKey="credit" fill="#F44336" name="Credit" barSize={20} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="balance"
              stroke="#ff7300"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 8 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
