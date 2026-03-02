"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export function ReportOpenFullPage({
  title,
  href,
  description,
}: {
  title: string;
  href: string;
  description?: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="font-headline text-xl">{title}</CardTitle>
          <CardDescription>
            {description ?? `Open ${title} in full page to manage and view details.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" variant="default">
            <Link href={href}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open full page
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
