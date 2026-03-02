"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import Link from "next/link";

export default function NotAuthorizedPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-lg text-center">
                <CardHeader>
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                        <Search className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <CardTitle className="font-headline text-5xl">404</CardTitle>
                    <CardDescription className="text-xl">
                        Page Not Found
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground">
                        Sorry, the page you are looking for does not exist or you do not have permission to access it.
                    </p>
                    <Link href="/dashboard">
                        <Button>Return to Dashboard</Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
