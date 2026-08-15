"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BILLING_TERMS_BY_LOCALE, type TermsLocale } from "@/legal/billingTermsLocales";
import { cn } from "@/lib/utils";

/** Category list (left) + selected section body (right). Locale tab switches language bodies. */
function TermsBody({ locale }: { locale: TermsLocale }) {
  const doc = BILLING_TERMS_BY_LOCALE[locale];
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setActiveIdx(0);
  }, [locale]);

  const safeIdx = Math.min(activeIdx, Math.max(0, doc.sections.length - 1));
  const section = doc.sections[safeIdx];

  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <header className="space-y-1 border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{doc.documentTitle}</h1>
        <p className="text-muted-foreground">
          {doc.lastUpdatedLabel}: {doc.lastUpdatedISO}
        </p>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <nav
          aria-label="Terms categories"
          className="w-full shrink-0 md:sticky md:top-4 md:w-64 lg:w-72 md:self-start"
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:hidden">
            Categories
          </p>
          <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto rounded-lg border bg-muted/30 p-1.5 md:max-h-[calc(100vh-10rem)]">
            {doc.sections.map((sec, i) => {
              const selected = i === safeIdx;
              return (
                <li key={`${locale}-cat-${i}`}>
                  <button
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground hover:bg-background"
                    )}
                    aria-current={selected ? "true" : undefined}
                  >
                    {sec.h}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <article className="min-w-0 flex-1 space-y-3 rounded-lg border bg-background p-4 sm:p-5">
          {section ? (
            <>
              <h2 className="text-base font-semibold text-foreground sm:text-lg">{section.h}</h2>
              {section.p.map((para, j) => (
                <p key={j} className="text-muted-foreground whitespace-pre-wrap">
                  {para}
                </p>
              ))}
            </>
          ) : null}
        </article>
      </div>
    </div>
  );
}

/**
 * Full billing / SaaS terms — category sidebar + detail pane; EN / NE / HI tabs.
 */
export default function BillingTermsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-16 sm:px-6">
      <Button variant="ghost" size="sm" className="-ml-2 mb-6 gap-1" asChild>
        <Link href="/billing">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to billing
        </Link>
      </Button>

      <Tabs defaultValue="en" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
          <TabsTrigger value="en">English</TabsTrigger>
          <TabsTrigger value="ne">नेपाली</TabsTrigger>
          <TabsTrigger value="hi">हिंदी</TabsTrigger>
        </TabsList>
        <TabsContent value="en" className="mt-0 outline-none">
          <TermsBody locale="en" />
        </TabsContent>
        <TabsContent value="ne" className="mt-0 outline-none">
          <TermsBody locale="ne" />
        </TabsContent>
        <TabsContent value="hi" className="mt-0 outline-none">
          <TermsBody locale="hi" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
