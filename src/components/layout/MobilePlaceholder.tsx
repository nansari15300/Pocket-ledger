
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Monitor } from "lucide-react";

export function MobilePlaceholder() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Monitor className="h-8 w-8" />
            </div>
          <CardTitle className="font-headline text-2xl">Desktop Recommended</CardTitle>
          <CardDescription>
            For the best experience, please use a desktop or larger screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Some features may not be fully accessible on mobile devices. We are working on a better mobile experience.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
