"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** User closed Stripe Checkout or cancelled — no charge. */
export default function BillingCancelPage() {
  return (
    <div className="p-4 sm:p-8 max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Checkout cancelled</CardTitle>
          <CardDescription>You were not charged. You can try again anytime from Billing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/billing">Back to Billing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
