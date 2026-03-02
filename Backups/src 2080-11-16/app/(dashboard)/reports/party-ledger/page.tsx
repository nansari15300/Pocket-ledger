
"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock } from "lucide-react";


export default function PartyLedgerPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Card className="border-dashed border-2 border-muted">
        <CardHeader>
          <CardTitle className="text-2xl">Party Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Clock className="h-5 w-5" />
            <AlertTitle>Coming Soon</AlertTitle>
            <AlertDescription>
              This is a placeholder for the <strong>Party Ledger report</strong>. Functionality to generate and view this report will be added soon.<br /><br />
              We're working hard to bring you this feature.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
