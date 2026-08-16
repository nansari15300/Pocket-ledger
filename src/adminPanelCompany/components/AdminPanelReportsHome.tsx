"use client";

import { BarChart3, BookOpenText, Landmark, ReceiptText, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTS = [
  {
    title: "Subscription sales",
    description: "Sales by plan, gateway, and payment date.",
    icon: ReceiptText,
  },
  {
    title: "Subscriber ledger",
    description: "Subscriber party balances and payment history.",
    icon: UsersRound,
  },
  {
    title: "Bank & gateway",
    description: "Gateway clearing, bank receipts, and payouts.",
    icon: Landmark,
  },
  {
    title: "General ledger",
    description: "System sales, commission, tax, expense, and adjustment entries.",
    icon: BookOpenText,
  },
] as const;

/** Isolated reports landing; report queries are added after auto-posting is enabled. */
export function AdminPanelReportsHome() {
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Admin Panel Company reports use only the isolated accounting tenant.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="transition-colors hover:bg-muted/30">
            <CardHeader className="flex-row items-start gap-3 space-y-0">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="mt-1">{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Available after automatic subscription sale posting is enabled.
            </CardContent>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">No accounting data yet</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          Create manual vouchers now; subscription sales, payments, tax, and agent commission will populate these
          reports automatically in the next phase.
        </CardContent>
      </Card>
    </main>
  );
}
