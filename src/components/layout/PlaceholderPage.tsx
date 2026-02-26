import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
    return (
        <div className="flex flex-1 items-center justify-center p-4 sm:p-6 md:p-8">
            <Card className="w-full max-w-2xl text-center">
                <CardHeader>
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <Construction className="h-8 w-8" />
                    </div>
                    <CardTitle className="font-headline text-3xl">{title}</CardTitle>
                    <CardDescription>
                        {description || "This page is under construction. Check back soon for updates!"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">We're working hard to bring you this feature.</p>
                </CardContent>
            </Card>
        </div>
    );
}
